import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SEED, login, requireEnv } from "./helpers";

/**
 * 사람 테스터 투입 전 전수 점검(스윕). 역할마다 홈에서 링크를 따라 같은 출처 페이지를 돌고(라우트 패턴별 최대 2개, 역할당 ~150쪽),
 * app/ 의 page.tsx 정적 라우트도 직접 연다. 페이지마다: HTTP 상태, Next 오류 오버레이/"Application error"/에러 경계 문구,
 * pageerror, console.error, 500 이상 응답(+같은 출처 4xx)을 기록한다.
 * 그리고 데이터를 바꾸지 않는 컨트롤만 누른다: 탭·필터·정렬·보기 전환(aria-pressed/role=tab), "자세히"·펼치기(aria-expanded),
 * 대화상자 열기(열고 닫기). window.confirm 은 모두 "취소"로 닫는다 — confirm 뒤의 변경 액션은 실행되지 않는다.
 * 결과: test-results/sweep/<role>.json + 콘솔 요약. 문제가 있으면 expect.soft 로 실패 표시(데이터는 그대로).
 *
 *   E2E_BASE_URL=http://localhost:3000 E2E_LOCAL=1 E2E_PASSWORD=... pnpm exec playwright test tests/e2e/sweep.spec.ts --reporter=line
 *   SWEEP_ROLES=admin,cn 로 역할을 고를 수 있다. SWEEP_MAX=150 (역할당 최대 페이지).
 */

type Role = { key: string; email: string | null; home: string; prefixes: string[]; seeds: string[] };

const B = (slug: string) => ["", "/requests", "/requests/new", "/offers", "/offers/print", "/orders", "/orders/new", "/samples", "/samples/new", "/progress", "/billing", "/exports", "/help", "/notifications", "/settings"].map((p) => `/b/${slug}${p}`);
const ADMIN = ["/admin", "/admin/audit", "/admin/audit?tab=money", "/admin/brands", "/admin/glossary", "/admin/notifications", "/admin/offers", "/admin/orders", "/admin/products", "/admin/requests", "/admin/requests/new", "/admin/samples", "/admin/settings", "/admin/vendors"];
const CN = ["/cn", "/cn/notifications", "/cn/products", "/cn/products/new", "/cn/tasks"];

const ROLES: Role[] = [
  { key: "brandAOwner", email: SEED.brandAOwner, home: `/b/${SEED.brandA}`, prefixes: [`/b/${SEED.brandA}`], seeds: B(SEED.brandA) },
  { key: "brandAMember", email: SEED.brandAMember, home: `/b/${SEED.brandA}`, prefixes: [`/b/${SEED.brandA}`], seeds: B(SEED.brandA) },
  { key: "brandBOwner", email: SEED.brandBOwner, home: `/b/${SEED.brandB}`, prefixes: [`/b/${SEED.brandB}`], seeds: B(SEED.brandB) },
  { key: "admin", email: SEED.admin, home: "/admin", prefixes: ["/admin"], seeds: ADMIN },
  { key: "cnSourcer", email: SEED.cnSourcer, home: "/cn", prefixes: ["/cn"], seeds: CN },
  { key: "cnVendor", email: "vendor@zhongzhou.example", home: "/cn", prefixes: ["/cn"], seeds: CN },
  { key: "anon", email: null, home: "/", prefixes: ["/login", "/apply", "/invite"], seeds: ["/", "/login", "/apply"] },
];

const MAX_PAGES = Number(process.env.SWEEP_MAX ?? 150);
const PER_PATTERN = 2;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ERROR_TEXT = /Application error|Unhandled Runtime Error|Internal Server Error|Server Error|문제가 생겼어요|오류가 발생|出错了|服务器错误|This page could not be found/;
/** 누르면 데이터가 바뀌는 버튼 — 화이트리스트에 걸려도 절대 누르지 않는다 */
const MUTATING = /저장|삭제|보내기|발행|승인|반려|확정|취소|요청|신고|동의|배정|숨기|재개|로그아웃|退出|提交|删除|发送|保存|出货|초대|변경|만들기|처리|접수|구매|돌려|입금|발송|도착|수령|비공개|되돌리|추가|읽음|已读|添加|开始|上传|拍照|相册|예약|합치|병합|보류|해제|노출|답변|번역|초안|재계산|집계|크레딧|업로드|올리기|담기|관심|거절|이대로|내보내기|선택$|모두 선택|新建|删|改|确认|有货|不足|可打样|不可打样|已看|未看|继承|例外|前移|后移|×/;
const SAFE_NAME = /자세히|접기|펼치기|더 보기|더보기|전체 보기|그리드|리스트|목록 보기|列表|网格|查看|展开|收起|筛选|정렬|필터|열기|미리보기|안내 보기/;

type Issue = { url: string; kind: string; detail: string; control?: string };
type Result = { role: string; pages: { url: string; status: number | null; ms: number }[]; clicks: { url: string; control: string; outcome: string }[]; issues: Issue[] };

const patternOf = (u: URL) => {
  const q = [...u.searchParams.entries()].map(([k, v]) => `${k}=${v.replace(UUID, "[id]")}`).sort().join("&");
  return u.pathname.replace(UUID, "[id]") + (q ? `?${q}` : "");
};

for (const role of ROLES) {
  const only = process.env.SWEEP_ROLES?.split(",");
  test.describe(`sweep · ${role.key}`, () => {
    test.beforeEach(requireEnv);
    test.skip(!!only && !only.includes(role.key), "SWEEP_ROLES 밖");
    test(`crawl + safe clicks (${role.key})`, async ({ page, context, baseURL }) => {
      test.setTimeout(40 * 60_000);
      if (role.email) await login(page, role.email);
      const res = await sweep(page, context, baseURL!, role);
      const dir = path.join("test-results", "sweep");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${role.key}.json`), JSON.stringify(res, null, 2));
      console.log(`[sweep:${role.key}] pages=${res.pages.length} clicks=${res.clicks.length} issues=${res.issues.length}`);
      for (const i of res.issues) console.log(`  ✗ ${i.kind} · ${i.url}${i.control ? ` · [${i.control}]` : ""} · ${i.detail.slice(0, 300)}`);
      for (const i of res.issues) expect.soft(i.detail, `${i.kind} @ ${i.url}${i.control ? ` [${i.control}]` : ""}`).toBe("");
    });
  });
}

async function sweep(page: Page, context: BrowserContext, base: string, role: Role): Promise<Result> {
  const out: Result = { role: role.key, pages: [], clicks: [], issues: [] };
  let current = "";
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|\[HMR\]|Fast Refresh|React DevTools|webpack-hmr|Failed to load resource/.test(t)) return; // 실패한 리소스는 response 로 따로 잡는다
    pageErrors.push(`console: ${t}`);
  });
  page.on("response", (r) => {
    const u = r.url();
    const same = u.startsWith(base);
    if (r.request().isNavigationRequest() && r.request().frame() === page.mainFrame()) return; // 이동 응답은 페이지 상태로 기록
    if (r.status() >= 500 || (same && r.status() >= 400)) {
      out.issues.push({ url: current, kind: `http ${r.status()}`, detail: `${r.request().method()} ${u.slice(0, 200)}` });
    }
  });
  page.on("dialog", (d) => d.dismiss().catch(() => {})); // confirm 은 언제나 취소 — 변경 액션을 막는다

  const seen = new Map<string, number>();
  const visited = new Set<string>();
  // SWEEP_EXTRA="/b/osle/offers/<id>,/admin/orders/<id>" — 링크로 닿지 않는 상세도 열어 본다(역할 영역 안의 것만)
  const extra = (process.env.SWEEP_EXTRA ?? "").split(",").filter((p) => p && role.prefixes.some((x) => p.startsWith(x)));
  const queue: string[] = [role.home, ...role.seeds, ...extra];

  while (queue.length && out.pages.length < MAX_PAGES) {
    const raw = queue.shift()!;
    const u = new URL(raw, base);
    u.hash = "";
    const key = u.pathname + u.search;
    if (visited.has(key)) continue;
    const pat = patternOf(u);
    if ((seen.get(pat) ?? 0) >= PER_PATTERN) continue;
    visited.add(key);
    seen.set(pat, (seen.get(pat) ?? 0) + 1);
    current = key;
    pageErrors.length = 0;
    const t0 = Date.now();
    let status: number | null = null;
    try {
      const r = await page.goto(key, { waitUntil: "load", timeout: 60_000 });
      status = r?.status() ?? null;
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    } catch (e) {
      out.issues.push({ url: key, kind: "goto failed", detail: String(e).slice(0, 300) });
      continue;
    }
    out.pages.push({ url: key, status, ms: Date.now() - t0 });
    const landed = new URL(page.url());
    if (status && status >= 400) out.issues.push({ url: key, kind: `page ${status}`, detail: `landed ${landed.pathname}${landed.search}` });
    await checkPage(page, key, pageErrors, out);

    // 링크 수집 (같은 영역만)
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || "")).catch(() => [] as string[]);
    for (const h of hrefs) {
      if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:")) continue;
      let n: URL;
      try { n = new URL(h, landed); } catch { continue; }
      if (n.origin !== new URL(base).origin) continue;
      if (!role.prefixes.some((p) => n.pathname === p || n.pathname.startsWith(p + "/") || (p === "/" && n.pathname === "/"))) continue;
      if (/\/api\//.test(n.pathname)) continue;
      n.hash = "";
      if (!visited.has(n.pathname + n.search)) queue.push(n.pathname + n.search);
    }

    // 같은 패턴의 첫 페이지에서만 안전한 컨트롤을 눌러 본다
    if ((seen.get(pat) ?? 0) === 1 && !(status && status >= 400)) await safeClicks(page, key, pageErrors, out);
  }
  void context;
  return out;
}

async function checkPage(page: Page, url: string, errs: string[], out: Result, control?: string) {
  const overlay = await page.locator("nextjs-portal").count().catch(() => 0);
  const body = (await page.locator("body").innerText().catch(() => "")) || "";
  const m = body.match(ERROR_TEXT);
  if (overlay) {
    const txt = await page.locator("nextjs-portal").evaluate((el) => (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").slice(0, 400)).catch(() => "");
    if (/Unhandled|Error|error/.test(txt)) out.issues.push({ url, control, kind: "next overlay", detail: txt });
  }
  if (m) out.issues.push({ url, control, kind: "error text", detail: body.slice(Math.max(0, body.indexOf(m[0]) - 80), body.indexOf(m[0]) + 200).replace(/\s+/g, " ") });
  for (const e of errs.splice(0)) out.issues.push({ url, control, kind: e.startsWith("console:") ? "console.error" : "pageerror", detail: e.slice(0, 500) });
}

async function safeClicks(page: Page, url: string, errs: string[], out: Result) {
  const cands = await page.evaluate(({ safe, mut }) => {
    const SAFE = new RegExp(safe), MUT = new RegExp(mut);
    const vis = (e: Element) => !!((e as HTMLElement).offsetWidth || (e as HTMLElement).offsetHeight || e.getClientRects().length);
    const list: { idx: number; name: string; why: string }[] = [];
    const all = [...document.querySelectorAll("main button, main [role=tab], main summary, header button[aria-expanded]")];
    all.forEach((el, idx) => {
      if (!vis(el) || (el as HTMLButtonElement).disabled || el.closest("fieldset:disabled")) return;
      const name = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
      if (!name || MUT.test(name)) return;
      const why = el.tagName === "SUMMARY" ? "summary" : el.getAttribute("role") === "tab" ? "tab" : el.hasAttribute("aria-expanded") ? "expander" : el.hasAttribute("aria-haspopup") ? "dialog" : el.hasAttribute("aria-pressed") ? "toggle" : SAFE.test(name) ? "safe-name" : "";
      if (why) list.push({ idx, name, why });
    });
    return list;
  }, { safe: SAFE_NAME.source, mut: MUTATING.source });

  const seenNames = new Set<string>();
  for (const c of cands.slice(0, 25)) {
    const k = `${c.why}:${c.name}`;
    if (seenNames.has(k)) continue; // 같은 이름 칩·토글이 여러 개면 하나만
    seenNames.add(k);
    const loc = page.locator("main button, main [role=tab], main summary, header button[aria-expanded]").nth(c.idx);
    const before = await snapshot(page);
    const urlBefore = page.url();
    let outcome = "";
    try {
      await loc.click({ timeout: 5_000 });
      await page.waitForTimeout(700);
      const after = await snapshot(page);
      if (page.url() !== urlBefore) outcome = `navigated → ${new URL(page.url()).pathname}${new URL(page.url()).search}`;
      else if (after !== before) outcome = "changed";
      else outcome = "NO VISIBLE CHANGE";
      // 대화상자가 열렸으면 닫는다
      const dlg = page.locator("[role=dialog], dialog[open]");
      if (await dlg.count()) {
        outcome += " · dialog opened";
        const close = dlg.getByRole("button", { name: /닫기|취소|关闭|取消|×/ }).first();
        if (await close.count()) await close.click().catch(() => {});
        else await page.keyboard.press("Escape");
      }
    } catch (e) {
      outcome = `click failed: ${String(e).split("\n")[0].slice(0, 160)}`;
    }
    out.clicks.push({ url, control: `${c.why} "${c.name}"`, outcome });
    await checkPage(page, url, errs, out, c.name);
    if (outcome === "NO VISIBLE CHANGE" && c.why !== "toggle") out.issues.push({ url, control: c.name, kind: "no-op click", detail: `${c.why} control produced no DOM/URL change` });
    if (page.url() !== urlBefore) {
      await page.goto(new URL(urlBefore).pathname + new URL(urlBefore).search).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    }
  }
}

const snapshot = (page: Page) =>
  page.evaluate(() => {
    const m = document.querySelector("main") ?? document.body;
    const ex = [...m.querySelectorAll("[aria-expanded],[aria-pressed],[aria-selected]")].map((e) => `${e.getAttribute("aria-expanded")}${e.getAttribute("aria-pressed")}${e.getAttribute("aria-selected")}`).join("");
    return `${(m as HTMLElement).innerText.length}:${ex}:${m.querySelectorAll("*").length}`;
  }).catch(() => "");

test.describe("sweep · 브랜드 분리 (자동점검 데이터)", () => {
  test.beforeEach(requireEnv);
  test("브랜드 B는 브랜드 A의 [자동점검] 요청·제안·샘플·발주를 404로 본다", async ({ page }) => {
    const ids = (process.env.SWEEP_A_IDS ?? "").split(",").filter(Boolean); // "requests/<id>,offers/<id>,samples/<id>,orders/<id>"
    test.skip(!ids.length, "SWEEP_A_IDS 없음");
    await login(page, SEED.brandBOwner);
    for (const p of ids) {
      for (const slug of [SEED.brandA, SEED.brandB]) {
        const r = await page.goto(`/b/${slug}/${p}`);
        expect.soft(r?.status(), `/b/${slug}/${p}`).toBe(404);
      }
    }
  });
});
