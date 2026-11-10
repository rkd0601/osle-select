import { expect, test } from "@playwright/test";
import { SEED, login, requireEnv } from "./helpers";

/**
 * 9차 검증(NEXT §0-l) E2E — 개발 DB에 데이터를 남기지 않는 범위(d-23)만: 화면 문장·동작·서버 이동.
 * 샘플 요청 → 출고 → 받음 → 구매 → 청구 합산 전 과정은 고정 시험 상품(E2E 测试商品)에 variant·관심 제안이 생기면 이어 붙인다 —
 * 지금은 단위 테스트(samples·brand-progress)가 구매가·자동 구매·결정 상태·청구 예정 합을 덮는다(STEP20_NOTES).
 */
test.describe("로그인 풀린 보호 화면 (9차 — 미들웨어 500)", () => {
  test.beforeEach(requireEnv);
  test("세션 없이 브랜드·관리자 화면 → 500이 아니라 로그인으로", async ({ request }) => {
    for (const p of [`/b/${SEED.brandA}`, `/b/${SEED.brandA}/requests/new`, "/admin", "/cn"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect(res.status(), p).toBe(307);
      expect(res.headers()["location"], p).toMatch(/\/login\?next=/);
    }
  });
});

test.describe("요청 작성 v3 (A1~A4)", () => {
  test.beforeEach(requireEnv);
  test("붙여넣기 상자: 링크 둘 → 스타일 둘, 링크 아닌 글은 상자에 남고 안내, 희망일 기본값 있음", async ({ page }) => {
    await login(page, SEED.brandAOwner);
    await page.goto(`/b/${SEED.brandA}/requests/new`);
    const box = page.getByPlaceholder(/여러 개면 줄마다 하나/);
    await box.fill("https://www.instagram.com/p/e2e1 https://item.taobao.com/item.htm?id=e2e2 메모");
    await box.press("Enter");
    await expect(page.locator(".style-row")).toHaveCount(2);
    await expect(page.locator(".style-row .chip").first()).toContainText("instagram.com");
    await expect(box).toHaveValue("메모");
    await expect(page.getByRole("status").filter({ hasText: "링크가 아닌 글 1개" })).toBeVisible();
    await expect(page.getByRole("button", { name: "스타일 2개 요청하기" })).toBeEnabled();
    expect(await page.locator('input[type="date"]').inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 자세히 = 카테고리·수량·공급가(선택)
    await page.locator(".style-row").first().getByRole("button", { name: "자세히" }).click();
    await expect(page.locator(".style-row .more")).toHaveCount(1);
    await page.locator(".style-row").first().getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("button", { name: "스타일 1개 요청하기" })).toBeEnabled();
  });
});

test.describe("샘플 v2 (S1·S8 — 무료 · 물류비 후불)", () => {
  test.beforeEach(requireEnv);
  test("샘플 요청서: 물류비 · 다음 청구에 합산 / 샘플 상품가 ₩0 / 돌려보내거나 구매 동의, 입금 안내 없음", async ({ page }) => {
    await login(page, SEED.brandAOwner);
    await page.goto(`/b/${SEED.brandA}/samples/new`);
    const main = page.locator("main");
    if (await main.getByText("관심 표시한 제안이 없어요").isVisible()) test.skip(true, "관심 제안 없음 — 시드에 따라 다르다");
    await expect(main.getByText("물류비 · 다음 청구에 합산")).toBeVisible();
    await expect(main.getByText("샘플 상품값", { exact: true })).toBeVisible();
    await expect(main.getByText(/돌려보내거나 구매해요/)).toBeVisible();
    await expect(main).not.toContainText(/입금 안내|입금 신고|입금해 주세요/);
    await expect(main).not.toContainText("미회수");
  });
  test("관리자 샘플 관리: 입금 탭 없음, 물류비(후불)·결정 열", async ({ page }) => {
    await login(page, SEED.admin);
    await page.goto("/admin/samples");
    await expect(page.getByRole("columnheader", { name: "물류비(후불)" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "결정" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("입금 확인 대기");
  });
});
