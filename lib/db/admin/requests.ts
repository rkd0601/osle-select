import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickerBrands } from "@/lib/e2e";
import { aggregateRequestStatus, type RequestItemStatus } from "@/lib/requests";
import { listUsersByRole } from "@/lib/db/users";

/** 관리자 요청 쿼리 (A-02). 중국어 원문·배정 정보까지 서비스 롤로 읽는다. 호출 전 requireRole(['ADMIN']). */

export async function listRequestQueue(filter: { status?: RequestItemStatus | "open"; limit?: number }) {
  const db = createAdminClient();
  let q = db
    .from("request_items")
    .select("id, request_id, seq, category, description, description_zh, status, owner_role, due_at, assigned_to, sla_date, brands(name, slug), requests(title, created_via)")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(filter.limit ?? 200);
  if (!filter.status || filter.status === "open") q = q.not("status", "in", "(closed,cancelled)");
  else q = q.eq("status", filter.status);
  const { data } = await q;
  return data ?? [];
}

export async function getAdminRequest(requestId: string) {
  const db = createAdminClient();
  const { data: req } = await db
    .from("requests")
    .select("id, brand_id, title, memo, memo_zh, target_date, created_via, created_at, brands(name, slug)")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return null;
  const [{ data: items }, { data: images }, { data: comments }, { data: questions }] = await Promise.all([
    db.from("request_items").select("id, seq, category, description, description_zh, target_price_krw, expected_qty_range, status, owner_role, due_at, assigned_to, sla_date").eq("request_id", requestId).order("seq"),
    db.from("request_images").select("id, request_item_id, storage_path, source_url, sort_order").eq("request_id", requestId).order("sort_order"),
    db.from("comments").select("id, target_type, target_id, visibility, body_ko, body_zh, author_id, created_at").eq("brand_id", req.brand_id).in("target_type", ["request", "request_item"]).order("created_at"),
    db.from("cn_questions").select("id, request_item_id, body_zh, body_ko, options, admin_gate_until, released_at, held_by_admin, answer, answered_at, created_at").eq("brand_id", req.brand_id).order("created_at"),
  ]);
  const its = (items ?? []) as { id: string; status: RequestItemStatus }[];
  const ids = new Set<string>([req.id, ...its.map((i) => i.id)]);
  return {
    request: { ...req, status: aggregateRequestStatus(its) },
    items: items ?? [],
    images: images ?? [],
    comments: (comments ?? []).filter((c) => ids.has(c.target_id)),
    questions: (questions ?? []).filter((q) => ids.has(q.request_item_id)),
  };
}

/** 배정 후보: CN 역할 사용자 (JWT app_metadata.role) + 프로필 이름 */
export async function listCnStaff() {
  const db = createAdminClient();
  const cn = await listUsersByRole(["CN_SOURCER", "CN_VENDOR"]);
  if (!cn.length) return [];
  const { data: profiles } = await db.from("profiles").select("id, display_name, is_active").in("id", cn.map((u) => u.id));
  return cn
    .map((u) => ({ id: u.id, role: u.role as string, name: profiles?.find((p) => p.id === u.id)?.display_name ?? u.email ?? u.id }))
    .filter((u) => profiles?.find((p) => p.id === u.id)?.is_active !== false)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "CN_SOURCER" ? -1 : 1)); // 배정 기본값이 원청 계정이 되지 않게 소싱 담당 먼저 (2026-11-04 UX 2차)
}

export async function listBrandsForProxy() {
  const { data } = await createAdminClient().from("brands").select("id, name, slug, status").order("name");
  return pickerBrands(data ?? []).map(({ id, name, slug }) => ({ id, name, slug })); // 숨김 제외 · 실브랜드 먼저 (d-23)
}
