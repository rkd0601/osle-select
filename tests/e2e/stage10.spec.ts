import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN_KEYS, SEED, login, requireEnv, zipTextEntries } from "./helpers";
import { E2E_BRAND_NAME, E2E_PRODUCT_NAME } from "../../lib/e2e";

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
    await page.getByRole("button", { name: /상품 파일 만들기/ }).click();
    const zipLink = page.getByRole("link", { name: "상품 파일 zip" }).first();
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

  // 고정 시드 상품에 기대지 않는다(NEXT §0-g). d-23: 고정 이름 "E2E 测试商品"을 찾아 쓰고(초안 → 그대로, 숨김 → 관리자가 초안으로 되돌림),
  // 없을 때만 C-02 간단 등록 화면으로 만든다(사진 1장 · 원가 · 원청 = 초안). 끝나면 숨김 전이 — 실행마다 늘지 않는다.
  test("조건 미충족 상품: 검수 요청을 강제로 눌러도 서버가 거부하고, 관리자 승인은 열리지 않는다", async ({ page }) => {
    await login(page, SEED.cnSourcer);
    let productId = await findCnProduct(page, "draft");
    if (!productId) {
      const hidden = await findCnProduct(page, "hidden");
      if (hidden) {
        await login(page, SEED.admin);
        await page.goto(`/admin/products/${hidden}`);
        page.once("dialog", (d) => d.accept());
        await page.getByRole("button", { name: "초안으로 되돌리기" }).click();
        await expect(page.getByRole("button", { name: "초안으로 되돌리기" })).toHaveCount(0, { timeout: 10_000 });
        await login(page, SEED.cnSourcer);
        productId = hidden;
      }
    }
    if (!productId) {
      await page.goto("/cn/products/new");
      await page.locator('input[type="file"][multiple]').setInputFiles({ name: "e2e.png", mimeType: "image/png", buffer: PNG_8PX });
      await expect(page.locator(".photo img")).toHaveCount(1, { timeout: 10_000 });
      await page.locator('input[inputmode="decimal"]').first().fill("12.5");
      await page.locator('input[maxlength="100"]').fill(E2E_PRODUCT_NAME);
      const save = page.locator('form button:not([type="button"])').last();
      if (await save.isDisabled()) await page.getByLabel(/档口名称|원청 이름/).fill("E2E 档口"); // 원청이 하나도 없을 때만
      await expect(save).toBeEnabled();
      await save.click();
      const detail = page.locator('[role="status"] a[href^="/cn/products/"]');
      await expect(detail).toBeVisible({ timeout: 30_000 });
      productId = (await detail.getAttribute("href"))!.split("/").pop()!;
    }

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
    await expect(page.locator("main")).toContainText(E2E_PRODUCT_NAME);
    await expect(page.getByRole("button", { name: /^승인|재승인/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("검수 완료");

    // 정리(d-23): 초안 → 숨김. 다음 실행은 같은 상품을 초안으로 되돌려 다시 쓴다
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "비공개 처리" }).click();
    await expect(page.getByRole("button", { name: "초안으로 되돌리기" })).toBeVisible({ timeout: 10_000 });
  });
});

/** CN 내 상품 목록에서 이름이 정확히 고정 이름인 상품 id (상태 탭 · 검색) — 예전 "E2E 测试商品 <tag> (…)"는 맞지 않는다 */
async function findCnProduct(page: Page, status: "draft" | "hidden"): Promise<string | null> {
  await page.goto(`/cn/products?status=${status}&q=${encodeURIComponent(E2E_PRODUCT_NAME)}`);
  const link = page.locator('a[href^="/cn/products/"]').filter({ has: page.locator("div.text-lead", { hasText: new RegExp(`^${E2E_PRODUCT_NAME}$`) }) }).first();
  if (!(await link.count())) return null;
  return (await link.getAttribute("href"))!.split("/").pop()!;
}

test.describe("A-07 신청 → 승인 → 초대", () => {
  test.beforeEach(requireEnv);

  // d-23: 고정 이름 "E2E 브랜드"(주소 e2e-brand)를 찾아 쓴다. 없으면 공개 신청 → 승인으로 만들고, 있으면(숨김 포함) 상세에서 초대 링크만 다시 연다.
  // 끝나면 숨김 전이 — 관리자 목록·선택 목록에 E2E 브랜드가 쌓이지 않는다.
  test("공개 신청을 관리자가 승인하면 브랜드가 생기고 초대 링크가 열린다", async ({ page, browser }) => {
    await login(page, SEED.admin);
    let opened = await openE2EBrand(page);
    let url: string | undefined;
    if (!opened) {
      // 앞선 실행이 신청만 남기고 끊겼으면 그 신청을 쓴다
      await page.goto("/admin/brands");
      if (!(await appRow(page).count())) {
        await page.goto("/apply");
        await page.getByLabel("브랜드·채널 이름").fill(E2E_BRAND_NAME);
        await page.locator('input[type="url"]').first().fill("https://instagram.com/e2e_brand");
        await page.getByLabel("담당자 이름").fill("E2E 담당");
        await page.locator('input[type="email"]').first().fill(E2E_BRAND_EMAIL);
        await page.getByRole("button", { name: "신청하기" }).click();
        await expect(page.locator("body")).toContainText("신청을 받았어요", { timeout: 10_000 });
        await page.goto("/admin/brands");
      }
      const row = appRow(page).first();
      await expect(row).toBeVisible();
      await row.locator("input").first().fill(E2E_BRAND_SLUG);
      await row.getByRole("button", { name: /^승인/ }).click();
      // 메일 키가 없는 로컬은 초대 링크를 화면에 보여준다. 메일이 나갔으면 링크 검증은 건너뛴다
      const msg = row.locator("p").last();
      await expect(msg.or(page.getByText(`/b/${E2E_BRAND_SLUG}`))).toBeVisible({ timeout: 10_000 });
      url = (await msg.innerText().catch(() => "")).match(INVITE_URL)?.[0];
      opened = await openE2EBrand(page);
      expect(opened).toBe(true);
    } else {
      // 이미 있는 브랜드: 숨김이면 재개 → 상세 초대 폼으로 초대 링크
      const resume = page.getByRole("button", { name: "재개" });
      if (await resume.count()) {
        page.once("dialog", (d) => d.accept());
        await resume.click();
        await expect(page.getByRole("button", { name: "숨기기" })).toBeVisible({ timeout: 10_000 });
      }
      await page.getByLabel("이메일", { exact: true }).fill("e2e+invite@example.com");
      await page.getByRole("button", { name: "초대", exact: true }).click();
      const msg = page.getByText(/초대 메일을 보냈어요|이 링크를 전달해 주세요/);
      await expect(msg).toBeVisible({ timeout: 10_000 });
      url = (await msg.innerText()).match(INVITE_URL)?.[0];
    }
    if (url) {
      const anon = await browser.newContext();
      const p2 = await anon.newPage();
      const res = await p2.goto(url);
      expect(res?.status()).toBe(200);
      await expect(p2.locator("body")).toContainText(E2E_BRAND_NAME);
      await anon.close();
    }

    // 정리(d-23): 숨김 — 다음 실행은 같은 브랜드를 재개해서 쓴다
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "숨기기" }).click();
    await expect(page.getByRole("button", { name: "재개" })).toBeVisible({ timeout: 10_000 });
  });
});

const E2E_BRAND_SLUG = "e2e-brand";
const E2E_BRAND_EMAIL = "e2e+brand@example.com";
/** 대기 중 신청 행 — 이름이 정확히 고정 이름인 것(예전 "E2E 브랜드 <tag>" 신청과 섞이지 않게) */
const appRow = (page: Page) => page.locator("li").filter({ has: page.locator("span.text-lead", { hasText: new RegExp(`^${E2E_BRAND_NAME}$`) }) });
const INVITE_URL = /https?:\/\/\S+\/invite\/[0-9a-f]+/;
const SLUG_CELL = new RegExp(`^/${E2E_BRAND_SLUG}(\\s|$)`);
/** 관리자 브랜드 목록(전체 → 숨김 탭)에서 주소가 정확히 /e2e-brand인 브랜드 상세를 연다. 없으면 false */
async function openE2EBrand(page: Page): Promise<boolean> {
  for (const tab of ["", "&tab=hidden"]) {
    await page.goto(`/admin/brands?q=${E2E_BRAND_SLUG}${tab}`);
    const row = page.locator("tbody tr").filter({ has: page.locator("span.code", { hasText: SLUG_CELL }) }).first();
    if (await row.count()) {
      await row.locator('a[href^="/admin/brands/"]').click();
      await expect(page).toHaveURL(/\/admin\/brands\/[0-9a-f-]{36}/);
      return true;
    }
  }
  return false;
}

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
