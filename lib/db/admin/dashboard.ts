import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { latestAt } from "@/lib/admin-recency";
import { avgMatchRate, offerInterestRate, overdueShare, sampleToOrderRate } from "@/lib/kpi";

/**
 * A-01 대시보드 (서비스 롤 — 레이아웃이 ADMIN 검증). 큐 = 기한이 있는 열린 일 전부(위아더·중국·브랜드 담당), 기한 순.
 * 화면이 담당 탭(위아더/중국/브랜드/지연)으로 나눈다 — 브랜드 차례는 위아더가 재촉할 일 (2026-11-04 UX 3차).
 * 행 표시(디자인 v2 A-01): 코드 줄(종류 · 브랜드 · #번호/상품 코드) + 제목(요청 제목·항목 / 첫 상품명 외 n · 수량) + 중국 담당자 이름.
 * 브랜드에 나가지 않는 관리자 화면 전용(원청·원가 없음). KPI = 최근 90일.
 * 행마다 created_at·activity_at(= updated_at·created_at 중 늦은 것) — 화면이 최근순·"새" 칩에 쓴다(§0-l P1, lib/admin-recency).
 */
export type QueueRow = {
  entity: string; id: string; status: string; owner_role: string; due_at: string; href: string;
  created_at: string | null;
  /** 최근 활동 시각 (updated_at·created_at 중 늦은 것) */
  activity_at: string | null;
  brand: string | null;
  /** 코드 줄 꼬리: 발주·샘플은 #id 앞 4자, 상품·제안은 상품 코드 */
  ref: string | null;
  /** 제목 본체: 요청 제목 · #항목 설명 / 상품명 / 첫 상품명 */
  name: string | null;
  /** 첫 상품 외 몇 개(발주·샘플) */
  more: number;
  /** 수량 합(발주 = 장, 샘플 = 점) */
  qty: number | null;
  /** 중국 차례일 때 담당자 이름(요청 항목 = 배정자, 상품·제안·샘플·발주 = 상품 등록자) */
  assignee: string | null;
};
type Prod = { code?: string | null; name_ko?: string | null; name_zh?: string | null; created_by?: string | null };
const one = <T,>(x: T | T[] | null | undefined) => ((Array.isArray(x) ? x[0] : x) ?? null) as T | null;
const shortId = (id: string) => `#${id.slice(0, 4).toUpperCase()}`;
const pname = (p: Prod | null) => p?.name_ko || p?.name_zh || null;

/** 라인(샘플 항목·발주 라인) → 첫 상품명 + 나머지 상품 수 + 수량 합 + 첫 상품 등록자 */
function lineSummary(lines: { qty: number; offers: unknown }[]) {
  const prods: Prod[] = [];
  for (const l of lines) {
    const p = one(one(l.offers as { products: Prod | Prod[] | null } | null)?.products);
    if (p && !prods.some((x) => x.code === p.code && pname(x) === pname(p))) prods.push(p);
  }
  return { name: pname(prods[0] ?? null), more: Math.max(0, prods.length - 1), qty: lines.reduce((n, l) => n + (l.qty || 0), 0), cnOwner: prods[0]?.created_by ?? null };
}

export async function getAdminQueue(): Promise<QueueRow[]> {
  const db = createAdminClient();
  const own = ["ADMIN", "CN", "BRAND"];
  const prod = "products(code, name_ko, name_zh, created_by)";
  const [ri, pr, of, sr, od] = await Promise.all([
    db.from("request_items").select("id, request_id, seq, description, status, owner_role, due_at, created_at, updated_at, assigned_to, brands(name), requests(title)").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("products").select("id, status, owner_role, due_at, created_at, updated_at, code, name_ko, name_zh, created_by").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("offers").select(`id, product_id, status, owner_role, due_at, created_at, updated_at, brands(name), ${prod}`).in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("sample_requests").select(`id, status, owner_role, due_at, created_at, updated_at, brands(name), sample_items(qty, offers(${prod}))`).in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("orders").select(`id, status, owner_role, due_at, created_at, updated_at, brands(name), order_lines(qty, expected_qty, offers(${prod}))`).in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
  ]);
  const brandOf = (b: unknown) => one(b as { name?: string } | { name?: string }[] | null)?.name ?? null;
  type Draft = QueueRow & { cnOwner: string | null };
  const when = (r: { created_at?: string | null; updated_at?: string | null }) => ({ created_at: r.created_at ?? null, activity_at: latestAt(r.updated_at, r.created_at) });
  const rows: Draft[] = [
    ...(ri.data ?? []).map((r) => ({
      ...when(r), entity: "request_item", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, href: `/admin/requests/${r.request_id}`,
      brand: brandOf(r.brands), ref: null, more: 0, qty: null, assignee: null, cnOwner: r.assigned_to ?? null,
      name: [one(r.requests as { title?: string } | null)?.title, `#${r.seq} ${r.description ?? ""}`.trim()].filter(Boolean).join(" · "),
    })),
    ...(pr.data ?? []).map((r) => ({
      ...when(r), entity: "product", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, href: `/admin/products/${r.id}`,
      brand: null, ref: r.code ?? null, name: pname(r), more: 0, qty: null, assignee: null, cnOwner: r.created_by ?? null,
    })),
    ...(of.data ?? []).map((r) => {
      const p = one(r.products as Prod | Prod[] | null);
      return {
        ...when(r), entity: "offer", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, href: r.product_id ? `/admin/offers/${r.product_id}` : `/admin/offers`,
        brand: brandOf(r.brands), ref: p?.code ?? null, name: pname(p), more: 0, qty: null, assignee: null, cnOwner: p?.created_by ?? null,
      };
    }),
    ...(sr.data ?? []).map((r) => {
      const s = lineSummary((r.sample_items ?? []) as { qty: number; offers: unknown }[]);
      return {
        ...when(r), entity: "sample_request", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, href: `/admin/samples/${r.id}`,
        brand: brandOf(r.brands), ref: shortId(r.id), name: s.name, more: s.more, qty: s.qty, assignee: null, cnOwner: s.cnOwner,
      };
    }),
    ...(od.data ?? []).map((r) => {
      const lines = ((r.order_lines ?? []) as { qty: number; expected_qty: number; offers: unknown }[]).map((l) => ({ qty: l.qty || l.expected_qty, offers: l.offers }));
      const s = lineSummary(lines);
      return {
        ...when(r), entity: "order", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, href: `/admin/orders/${r.id}`,
        brand: brandOf(r.brands), ref: shortId(r.id), name: s.name, more: s.more, qty: s.qty, assignee: null, cnOwner: s.cnOwner,
      };
    }),
  ];
  // 중국 차례 행의 담당자 이름 — 프로필 표시 이름 한 번에
  const ids = [...new Set(rows.filter((r) => r.owner_role === "CN" && r.cnOwner).map((r) => r.cnOwner!))];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] as { id: string; display_name: string | null }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return rows
    .map(({ cnOwner, ...r }) => ({ ...r, assignee: r.owner_role === "CN" && cnOwner ? (nameOf.get(cnOwner) ?? null) : null }))
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** 큐 밖의 관리자 할 일: 브랜드 가입 신청·주소 변경 요청(기한 없음) — 대시보드에 숫자로만 (2026-11-04 UX 2차) */
export async function getAdminPendingCounts() {
  const db = createAdminClient();
  const [{ count: applications }, { count: slugRequests }] = await Promise.all([
    db.from("brand_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("brand_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return { applications: applications ?? 0, slugRequests: slugRequests ?? 0 };
}

export async function getKpis(now = new Date()) {
  const db = createAdminClient();
  const since = new Date(now.getTime() - 90 * 86400000).toISOString();
  const [{ data: ins }, { data: offers }, { data: sampleFb }, { data: ordered }, { data: open }, { count: unreturned }] = await Promise.all([
    db.from("inspections").select("info_match_rate").eq("type", "bulk").gte("inspected_at", since),
    db.from("offers").select("status, reaction").gte("issued_at", since).limit(5000),
    db.from("sample_items").select("offer_id").eq("feedback", "interested").gte("created_at", since).limit(5000),
    db.from("order_lines").select("offer_id, orders!inner(status)").in("orders.status", ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"]).limit(5000),
    db.from("orders").select("due_at").not("owner_role", "is", null).limit(2000),
    db.from("sample_items").select("id", { count: "exact", head: true }).eq("return_status", "kept").eq("charge_status", "charged"),
  ]);
  return {
    matchRate: avgMatchRate(ins ?? []),
    inspections: ins?.length ?? 0,
    offerInterest: offerInterestRate(offers ?? []),
    sampleToOrder: sampleToOrderRate((sampleFb ?? []).map((s) => s.offer_id), (ordered ?? []).map((l) => l.offer_id)),
    orderOverdue: overdueShare(open ?? [], now),
    unreturned: unreturned ?? 0,
  };
}
