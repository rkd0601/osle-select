import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { avgMatchRate, offerInterestRate, overdueShare, sampleToOrderRate } from "@/lib/kpi";

/**
 * A-01 대시보드 (서비스 롤 — 레이아웃이 ADMIN 검증). 큐 = 기한이 있는 열린 일 전부(위아더·중국·브랜드 담당), 기한 순.
 * 화면이 담당 칩(위아더/중국/브랜드/지연)으로 나눈다 — 브랜드 차례는 위아더가 재촉할 일 (2026-11-04 UX 3차).
 * KPI = 최근 90일.
 */
export type QueueRow = { entity: string; id: string; status: string; owner_role: string; due_at: string; brand: string | null; title: string | null; href: string };
const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as { name?: string; title?: string } | null;

export async function getAdminQueue(): Promise<QueueRow[]> {
  const db = createAdminClient();
  const own = ["ADMIN", "CN", "BRAND"];
  const [ri, pr, of, sr, od] = await Promise.all([
    db.from("request_items").select("id, request_id, seq, description, status, owner_role, due_at, brands(name)").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("products").select("id, status, owner_role, due_at, code, name_ko, name_zh").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("offers").select("id, product_id, status, owner_role, due_at, brands(name)").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("sample_requests").select("id, status, owner_role, due_at, brands(name)").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
    db.from("orders").select("id, status, owner_role, due_at, brands(name)").in("owner_role", own).not("due_at", "is", null).order("due_at").limit(200),
  ]);
  const rows: QueueRow[] = [
    ...(ri.data ?? []).map((r) => ({ entity: "request_item", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, brand: one(r.brands)?.name ?? null, title: `#${r.seq} ${r.description ?? ""}`.trim(), href: `/admin/requests/${r.request_id}` })),
    ...(pr.data ?? []).map((r) => ({ entity: "product", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, brand: null, title: [r.code, r.name_ko || r.name_zh].filter(Boolean).join(" · ") || null, href: `/admin/products/${r.id}` })),
    ...(of.data ?? []).map((r) => ({ entity: "offer", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, brand: one(r.brands)?.name ?? null, title: null, href: r.product_id ? `/admin/offers/${r.product_id}` : `/admin/offers` })),
    ...(sr.data ?? []).map((r) => ({ entity: "sample_request", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, brand: one(r.brands)?.name ?? null, title: null, href: `/admin/samples/${r.id}` })),
    ...(od.data ?? []).map((r) => ({ entity: "order", id: r.id, status: r.status, owner_role: r.owner_role!, due_at: r.due_at!, brand: one(r.brands)?.name ?? null, title: null, href: `/admin/orders/${r.id}` })),
  ];
  return rows.sort((a, b) => a.due_at.localeCompare(b.due_at));
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
