import { expect, test } from "@playwright/test";
import { FORBIDDEN_KEYS, SEED, login, requireEnv, zipTextEntries } from "./helpers";

/**
 * 10단계 E2E 묶음 (CLAUDE.md "테스트 필수"): B-12 패키지 내용 금지 키, 공개 조건 서버 거부, A-07 신청 → 승인 → 초대 링크, 관리자 설정 화면.
 * 시드(supabase/seed.sql) + 실행 중인 앱이 있어야 돈다. E2E_BASE_URL 없으면 skip — 로컬은 `pnpm e2e:local`.
 */
const PENDING_PRODUCT = "40000000-0000-0000-0000-000000000003"; // 시드: 혼용률·중량 없음 → 공개 조건 미충족

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

  test("조건 미충족 상품: 버튼을 강제로 눌러도 승인되지 않는다", async ({ page }) => {
    await login(page, SEED.admin);
    await page.goto(`/admin/products/${PENDING_PRODUCT}`);
    const approve = page.getByRole("button", { name: /^승인|재승인/ }).first();
    await expect(approve).toBeDisabled();
    // UI 잠금을 우회해 서버 액션을 그대로 호출
    await approve.evaluate((b: HTMLButtonElement) => { b.disabled = false; });
    await approve.click({ force: true });
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.locator("body")).not.toContainText("검수 완료");
    await expect(page.getByRole("button", { name: /^승인|재승인/ }).first()).toBeDisabled();
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
