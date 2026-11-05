/**
 * E2E 찌꺼기 정리 (COWORK_DECISIONS d-23 · NEXT §0-j E1) — dev 전용, 한 번 돌리는 스크립트.
 * 이름이 "E2E "로 시작하는 상품(name_zh·name_ko)·브랜드를 **숨김(hidden) 전이**로 옮긴다. 지우지 않는다(hard delete 없음).
 * 전이는 lib/transitions.ts 표(위아더 권한)로 검사하고, 낙관적 잠금(현재 status 일치) + 전이 감사 로그(action 'transition', actor 없음 = 시스템)를 남긴다.
 *
 *   CLEANUP_E2E=1 node --env-file=.env.local scripts/cleanup-e2e.ts           # 미리 보기(기본): 상태별 건수만
 *   CLEANUP_E2E=1 node --env-file=.env.local scripts/cleanup-e2e.ts --apply   # 숨김 전이 실행
 *
 * 막는 경우: CLEANUP_E2E=1 없음 · VERCEL_ENV/NODE_ENV=production · NEXT_PUBLIC_APP_URL이 로컬·개발 주소가 아님.
 * 브랜드 숨김은 0056(brands.status에 'hidden') 적용 뒤에만 된다 — 안 됐으면 브랜드는 건너뛰고 알려 준다.
 * 비밀값(키·URL)은 출력하지 않는다. Node 22.18+(타입 제거 기본)로 바로 돈다.
 */
import { createClient } from "@supabase/supabase-js";

type Transitions = typeof import("../lib/transitions");
type E2E = typeof import("../lib/e2e");
// Node ESM은 확장자 없는 상대 경로를 못 찾고, tsc는 .ts 확장자 import를 막는다 → 런타임 경로만 문자열로
const { canTransition } = (await import(new URL("../lib/transitions.ts", import.meta.url).href)) as Transitions;
const { E2E_PREFIX, isE2EName } = (await import(new URL("../lib/e2e.ts", import.meta.url).href)) as E2E;

const env = process.env;
const apply = process.argv.includes("--apply");

function refuse(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (env.CLEANUP_E2E !== "1") refuse("CLEANUP_E2E=1 이 없다 — dev DB에서만, 일부러 켜고 돌린다.");
if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") refuse("운영 환경(VERCEL_ENV/NODE_ENV=production)에서는 돌리지 않는다.");
const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
if (appUrl) {
  let host = "";
  try { host = new URL(appUrl).hostname; } catch { refuse("NEXT_PUBLIC_APP_URL을 읽을 수 없다."); }
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost") || host.endsWith(".test");
  const devLabel = host.split(".").some((l) => /^(dev|staging|stage|test|qa|preview|sandbox)(-|$)/.test(l));
  if (!local && !devLabel) refuse("NEXT_PUBLIC_APP_URL이 로컬·개발 주소가 아니다 — 운영 DB일 수 있어 멈춘다.");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) refuse("NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요하다(--env-file=.env.local).");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = { id: string; status: string; name: string };
const countBy = (rows: Row[]) => Object.fromEntries([...rows.reduce((m, r) => m.set(r.status, (m.get(r.status) ?? 0) + 1), new Map<string, number>())]);

// 상품: name_zh 또는 name_ko가 "E2E "로 시작 (ilike 패턴 — 접두어에 와일드카드 문자 없음)
const pattern = `${E2E_PREFIX}%`;
const { data: prods, error: pe } = await db.from("products").select("id, status, name_zh, name_ko").or(`name_zh.ilike.${pattern},name_ko.ilike.${pattern}`).limit(1000);
if (pe) refuse(`상품 조회 실패: ${pe.message}`);
const products: Row[] = (prods ?? [])
  .map((p) => ({ id: p.id as string, status: p.status as string, name: ((isE2EName(p.name_zh) ? p.name_zh : p.name_ko) ?? "") as string }))
  .filter((p) => isE2EName(p.name)); // ilike는 대소문자를 안 가리므로 정확한 접두어로 한 번 더

const { data: brs, error: be } = await db.from("brands").select("id, status, name").ilike("name", pattern).limit(1000);
if (be) refuse(`브랜드 조회 실패: ${be.message}`);
const brands: Row[] = (brs ?? []).map((b) => ({ id: b.id as string, status: b.status as string, name: b.name as string })).filter((b) => isE2EName(b.name));

// 대기 중 E2E 신청(관리자 브랜드 화면 맨 위에 보인다) — 건수만 알린다(바꾸지 않음)
const { count: pendingApps } = await db.from("brand_applications").select("id", { count: "exact", head: true }).ilike("brand_name", pattern).eq("status", "pending");

console.log(`모드: ${apply ? "실행(--apply) — 숨김 전이만, 삭제 없음" : "미리 보기(바꾸지 않음)"}`);
console.log(`상품 "E2E …" ${products.length}건 · 상태별`, countBy(products));
console.log(`브랜드 "E2E …" ${brands.length}건 · 상태별`, countBy(brands));
console.log(`대기 중 E2E 신청 ${pendingApps ?? 0}건 (이 스크립트는 바꾸지 않음)`);

const toHide = <T extends Row>(rows: T[], entity: "product" | "brand") => {
  const todo = rows.filter((r) => r.status !== "hidden");
  const ok = todo.filter((r) => canTransition(entity, r.status, "hidden", "ADMIN"));
  const blocked = todo.filter((r) => !ok.includes(r));
  return { ok, blocked };
};
const P = toHide(products, "product");
const B = toHide(brands, "brand");
console.log(`숨김 대상: 상품 ${P.ok.length}건, 브랜드 ${B.ok.length}건 · 전이 표가 막아 건너뜀: 상품 ${P.blocked.length}건, 브랜드 ${B.blocked.length}건`);
if (P.blocked.length) console.log("  건너뛴 상품 상태:", countBy(P.blocked));
if (B.blocked.length) console.log("  건너뛴 브랜드 상태:", countBy(B.blocked));

if (!apply) {
  console.log("미리 보기만 했다. 숨기려면 --apply.");
  process.exit(0);
}

async function hide(table: "products" | "brands", entity: "product" | "brand", rows: Row[]) {
  let done = 0;
  const failed: string[] = [];
  for (const r of rows) {
    const patch = entity === "product" ? { status: "hidden", owner_role: null, due_at: null } : { status: "hidden", updated_at: new Date().toISOString() };
    const { data, error } = await db.from(table).update(patch).eq("id", r.id).eq("status", r.status).select("id");
    if (error) {
      // 23514 = check 위반 → brands.status에 'hidden'이 아직 없다(0056 미적용)
      failed.push(error.code === "23514" ? "check(0056 미적용)" : error.code ?? "error");
      if (error.code === "23514") break;
      continue;
    }
    if (!data?.length) { failed.push("stale"); continue; }
    await db.from("audit_logs").insert({ actor_id: null, action: "transition", entity, entity_id: r.id, diff: { from: r.status, to: "hidden", note: "cleanup-e2e (d-23)" } });
    done++;
  }
  return { done, failed };
}

const hp = await hide("products", "product", P.ok);
console.log(`상품 숨김 ${hp.done}/${P.ok.length}${hp.failed.length ? ` · 실패 ${hp.failed.length} (${[...new Set(hp.failed)].join(", ")})` : ""}`);
const hb = await hide("brands", "brand", B.ok);
console.log(`브랜드 숨김 ${hb.done}/${B.ok.length}${hb.failed.length ? ` · 실패 ${hb.failed.length} (${[...new Set(hb.failed)].join(", ")})` : ""}`);
if (hb.failed.includes("check(0056 미적용)")) console.log("  → supabase/migrations/0056_brand_hidden_status.sql 적용 뒤 다시 --apply.");
