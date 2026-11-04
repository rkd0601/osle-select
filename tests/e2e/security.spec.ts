import { expect, test } from "@playwright/test";
import { FORBIDDEN_KEYS, SEED, login, requireEnv } from "./helpers";

/**
 * PRD 12장 수용 기준 E2E 뼈대.
 * 1) 브랜드 A → 브랜드 B 리소스 전부 404, 존재하지 않는 slug와 구분 불가
 * 2) 브랜드 세션 응답(HTML + RSC 페이로드) 어디에도 원가·원청·중국어 원문 키 없음
 * 3) CN_VENDOR에게 브랜드명·희망 단가 없음 (시드에 VENDOR 계정이 생기면 활성화)
 */
test.describe("brand isolation", () => {
  test.beforeEach(requireEnv);

  test("브랜드 A로 브랜드 B·미존재 slug는 같은 404", async ({ page }) => {
    test.setTimeout(60_000); // 화면 15개 순회 — 로컬 dev 서버의 첫 컴파일이 30초를 넘길 수 있다
    await login(page, SEED.brandAOwner);
    const paths = [`/b/${SEED.brandB}`, `/b/${SEED.brandB}/samples`, `/b/${SEED.brandB}/offers`, `/b/${SEED.brandB}/offers/${SEED.brandAOfferId}`, `/b/${SEED.brandB}/requests`, `/b/${SEED.brandB}/requests/new`, `/b/${SEED.brandB}/requests/${SEED.brandARequestId}`,
      `/b/${SEED.brandB}/orders`, `/b/${SEED.brandB}/orders/new`, `/b/${SEED.brandB}/exports`, `/b/${SEED.brandB}/settings`, `/b/${SEED.brandB}/notifications`,
      `/b/${SEED.brandB}/progress`, `/b/${SEED.brandB}/billing`, // 메뉴 넷(d-6)
      "/b/no-such-brand", "/b/no-such-brand/requests", "/b/no-such-brand/settings"];
    const bodies: string[] = [];
    for (const p of paths) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(404);
      bodies.push(((await page.locator("main, body").first().innerText()) ?? "").trim());
    }
    expect(new Set(bodies).size, "404 화면이 slug 존재 여부에 따라 달라지면 안 된다").toBe(1);
  });

  test("브랜드 B는 브랜드 A 요청·제안 상세를 404로 본다", async ({ page }) => {
    await login(page, SEED.brandBOwner);
    for (const p of [`/b/${SEED.brandA}/requests/${SEED.brandARequestId}`, `/b/${SEED.brandA}/offers/${SEED.brandAOfferId}`, `/b/${SEED.brandB}/offers/${SEED.brandAOfferId}`]) {
      expect((await page.goto(p))?.status(), p).toBe(404);
    }
  });

  test("브랜드 역할은 /admin·/cn 404", async ({ page }) => {
    await login(page, SEED.brandAMember);
    for (const p of ["/admin", "/admin/requests", "/admin/settings", "/admin/glossary", "/admin/audit", "/admin/brands", "/cn", `/cn/items/${SEED.brandARequestId}`]) {
      expect((await page.goto(p))?.status(), p).toBe(404);
    }
  });
});

test.describe("cost leak", () => {
  test.beforeEach(requireEnv);

  test("브랜드 화면 응답에 금지 키 없음", async ({ page }) => {
    test.setTimeout(90_000); // 화면 20개 순회 — 로컬 dev 첫 컴파일
    await login(page, SEED.brandAOwner);
    const paths = [
      `/b/${SEED.brandA}`, `/b/${SEED.brandA}/requests`, `/b/${SEED.brandA}/requests/${SEED.brandARequestId}`, `/b/${SEED.brandA}/requests/new`,
      `/b/${SEED.brandA}/offers`, `/b/${SEED.brandA}/offers/print`, `/b/${SEED.brandA}/offers/${SEED.brandAOfferId}`,
      `/b/${SEED.brandA}/samples`, `/b/${SEED.brandA}/samples/new`,
      `/b/${SEED.brandA}/orders`, `/b/${SEED.brandA}/orders/new`, `/b/${SEED.brandA}/exports`, `/b/${SEED.brandA}/settings`, `/b/${SEED.brandA}/notifications`,
      `/b/${SEED.brandA}/progress`, `/b/${SEED.brandA}/progress?f=done`, `/b/${SEED.brandA}/billing`,
    ];
    for (const p of paths) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      const html = (await res?.text()) ?? "";
      const m = html.match(FORBIDDEN_KEYS);
      expect(m?.[0] ?? null, `${p} 응답에 금지 키`).toBeNull();
    }
  });
});

test.describe("CN masking", () => {
  test.beforeEach(requireEnv);
  test.skip(!process.env.E2E_CN_VENDOR_EMAIL, "CN_VENDOR 시드 계정이 생기면 E2E_CN_VENDOR_EMAIL로 활성화");

  test("CN_VENDOR /cn 에 브랜드명·목표가 없음", async ({ page }) => {
    await login(page, process.env.E2E_CN_VENDOR_EMAIL!);
    const html = (await (await page.goto("/cn"))?.text()) ?? "";
    expect(html).not.toContain("오슬");
    expect(html).not.toMatch(/目标进价|target_price_krw":\d/);
  });
});
