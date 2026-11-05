import { expect, test } from "@playwright/test";
import { FORBIDDEN_KEYS, SEED, login, requireEnv, zipTextEntries } from "./helpers";

/**
 * 10단계 E2E 묶음 (CLAUDE.md "테스트 필수"): B-12 패키지 내용 금지 키, 공개 조건 서버 거부, A-07 신청 → 승인 → 초대 링크, 관리자 설정 화면.
 * 시드(supabase/seed.sql) + 실행 중인 앱이 있어야 돈다. E2E_BASE_URL 없으면 skip — 로컬은 `pnpm e2e:local`.
 */
/** 8×8 회색 PNG — C-02 사진 1장(브라우저가 WebP로 리사이즈) */
const PNG_8PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGPowAEYhpYEANsRZgG2EIOkAAAAAElFTkSuQmCC", "base64");

test.describe("B-12 패키지 원가 누출", () => {
  test.beforeEach(requireEnv);

  test("브랜드 세션으로 만든 표준 패키지 zip·CSV에 금지 키·중국어 없음", async ({ page }) => {
    await login(page, SEED.brandAOwner);
    await page.goto(`/b/${SEED.brandA}/exports`);
    const boxes = page.locator('ul input[type="checkbox"]');
    test.skip((await boxes.count()) === 0, "시드에 패키지 대상(발주 확정·샘플 채택) 상품이 없다");
    await boxes.first().check();
    await page.getByRole("button", { name: /패키지 만들기/ }).click();
    const zipLink = page.getByRole("link", { name: "패키지 zip" }).first();
    await expect(zipLink).toBeVisible({ timeout: 30_000 });
    const zip = await page.request.get((await zipLink.getAttribute("href"))!);
    expect(zip.ok()).toBe(true);
    const entries = zipTextEntries(Buffer.from(await zip.body()));
    expect(entries.map((e) => e.name)).toEqual(expect.arrayContaining(["README.txt", "products.csv", "options.csv", "sizes.csv"]));
    for (const e of entries) {
      expect(e.text.match(FORBIDDEN_KEYS)?.[0] ?? null, `${e.name} 금지 키`).toBeNull();
      expect(e.text.match(/[一-鿿]/)?.[0] ?? null, `${e.name} 중국어`).toBeNull();
    }
    const products = entries.find((e) => e.name === "products.csv")!.text;
    expect(products.split("\r\n")[0]).toContain("상품코드,상품명,카테고리,판매가");
  });
});

test.describe("공개 조건은 서버가 검사한다 (절대 규칙 6)", () => {
  test.beforeEach(requireEnv);

  // 고정 시드 상품에 기대지 않는다(NEXT §0-g): 테스트가 C-02 간단 등록 화면으로 임시 상품(사진 1장 · 원가 · 원청 = 초안)을 직접 만든다.
  // 상품 삭제 기능이 없어(초안은 숨김 전이도 없다) 이름으로 시험 상품임을 밝혀 둔다.
  test("조건 미충족 상품: 검수 요청을 강제로 눌러도 서버가 거부하고, 관리자 승인은 열리지 않는다", async ({ page }) => {
    const tag = Date.now().toString(36);
    await login(page, SEED.cnSourcer);
    await page.goto("/cn/products/new");
    await page.locator('input[type="file"][multiple]').setInputFiles({ name: "e2e.png", mimeType: "image/png", buffer: PNG_8PX });
    await expect(page.locator(".photo img")).toHaveCount(1, { timeout: 10_000 });
    await page.locator('input[inputmode="decimal"]').first().fill("12.5");
    await page.locator('input[maxlength="100"]').fill(`E2E 测试商品 ${tag} (自动生成·勿用)`);
    const save = page.locator('form button:not([type="button"])').last();
    if (await save.isDisabled()) await page.getByLabel(/档口名称|원청 이름/).fill(`E2E 档口 ${tag}`); // 원청이 하나도 없을 때만
    await expect(save).toBeEnabled();
    await save.click();
    const detail = page.locator('[role="status"] a[href^="/cn/products/"]');
    await expect(detail).toBeVisible({ timeout: 30_000 });
    const productId = (await detail.getAttribute("href"))!.split("/").pop()!;

    // CN: 검수 요청 버튼은 비활성 — UI 잠금을 우회해 서버 액션을 그대로 호출해도 거부(product.error.checksFailed)
    await page.goto(`/cn/products/${productId}`);
    const submit = page.getByRole("button", { name: /提交审核|검수 요청/ });
    await expect(submit).toBeDisabled();
    // React는 props.disabled인 버튼의 클릭을 버리므로 disabled 속성만 지워서는 액션이 안 불린다 — 버튼의 onClick 핸들러를 직접 호출
    await submit.evaluate((b: HTMLButtonElement) => {
      const key = Object.keys(b).find((k) => k.startsWith("__reactProps$"));
      (b as unknown as Record<string, { onClick: () => void }>)[key!].onClick();
    });
    await expect(page.getByRole("status").filter({ hasText: /上架条件未满足|공개 조건이 충족되지 않았어요/ })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: /提交审核|검수 요청/ })).toBeDisabled();

    // 관리자: 검수 대기가 아니므로 승인 버튼이 없고, 검수 완료로 바뀌지 않았다
    await login(page, SEED.admin);
    await page.goto(`/admin/products/${productId}`);
    await expect(page.locator("main")).toContainText(tag);
    await expect(page.getByRole("button", { name: /^승인|재승인/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("검수 완료");
  });
});

test.describe("A-07 신청 → 승인 → 초대", () => {
  test.beforeEach(requireEnv);

  test("공개 신청을 관리자가 승인하면 브랜드가 생기고 초대 링크가 열린다", async ({ page, browser }) => {
    const tag = Date.now().toString(36);
    await page.goto("/apply");
    await page.getByLabel("브랜드·채널 이름").fill(`E2E 브랜드 ${tag}`);
    await page.locator('input[type="url"]').first().fill(`https://instagram.com/e2e_${tag}`);
    await page.getByLabel("담당자 이름").fill("E2E 담당");
    await page.locator('input[type="email"]').first().fill(`e2e+${tag}@example.com`);
    await page.getByRole("button", { name: "신청하기" }).click();
    await expect(page.locator("body")).toContainText("신청을 받았어요", { timeout: 10_000 });

    await login(page, SEED.admin);
    await page.goto("/admin/brands");
    const row = page.locator("li", { hasText: `E2E 브랜드 ${tag}` });
    await expect(row).toBeVisible();
    await row.locator("input").first().fill(`e2e-${tag}`);
    await row.getByRole("button", { name: /^승인/ }).click();
    // 메일 키가 없는 로컬은 초대 링크를 화면에 보여준다. 메일이 나갔으면 링크 검증은 건너뛴다
    const msg = row.locator("p").last();
    await expect(msg.or(page.getByText(`/b/e2e-${tag}`))).toBeVisible({ timeout: 10_000 });
    const url = (await msg.innerText().catch(() => "")).match(/https?:\/\/\S+\/invite\/[0-9a-f]+/)?.[0];
    if (url) {
      const anon = await browser.newContext();
      const p2 = await anon.newPage();
      const res = await p2.goto(url);
      expect(res?.status()).toBe(200);
      await expect(p2.locator("body")).toContainText(`E2E 브랜드 ${tag}`);
      await anon.close();
    }
  });
});

test.describe("A-08 설정·감사 로그", () => {
  test.beforeEach(requireEnv);

  test("설정 화면은 범위 밖 환율을 저장하지 않고, 감사 로그 돈 탭이 열린다", async ({ page }) => {
    await login(page, SEED.admin);
    await page.goto("/admin/settings");
    const fx = page.getByLabel("환율 (1위안 = 원)");
    await fx.fill("9999");
    await expect(page.getByText(/100~400원/)).toBeVisible();
    const res = await page.goto("/admin/audit?tab=money");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "돈 관련" })).toBeVisible();
  });
});
