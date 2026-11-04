import "server-only";
import { createClient } from "@/lib/supabase/server";
import { aggregateRequestStatus, type RequestItemStatus } from "@/lib/requests";

/**
 * 브랜드 세션 요청 쿼리 (B-01·B-03). 사용자 세션(RLS) + brand_id 필터 이중 방어.
 * requests/request_items 테이블이 아니라 v_requests_brand / v_request_items_brand 뷰만 읽는다(중국어 원문·CN 담당자 제외).
 */
const ITEM_COLS = "id, request_id, seq, category, description, target_price_krw, expected_qty_range, status, owner_role, due_at, expected_offer_date, created_at";
export type BrandRequestItem = {
  id: string; request_id: string; seq: number; category: string | null; description: string; target_price_krw: number | null;
  expected_qty_range: string | null; status: RequestItemStatus; owner_role: string | null; due_at: string | null; expected_offer_date: string | null; created_at: string;
};

export async function listBrandRequests(brandId: string) {
  const supabase = await createClient();
  const [{ data: reqs }, { data: items }] = await Promise.all([
    supabase.from("v_requests_brand").select("id, title, target_date, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(100),
    supabase.from("v_request_items_brand").select("request_id, status, owner_role, due_at").eq("brand_id", brandId),
  ]);
  return (reqs ?? []).map((r) => {
    const its = (items ?? []).filter((i) => i.request_id === r.id) as { status: RequestItemStatus; owner_role: string | null; due_at: string | null }[];
    const brandDue = its.filter((i) => i.owner_role === "BRAND" && i.due_at).map((i) => i.due_at!).sort()[0] ?? null;
    return { ...r, status: aggregateRequestStatus(its), itemCount: its.length, brandDue };
  });
}

export async function getBrandRequest(brandId: string, requestId: string) {
  const supabase = await createClient();
  const { data: req } = await supabase.from("v_requests_brand").select("id, title, memo, target_date, created_via, created_by, created_at").eq("brand_id", brandId).eq("id", requestId).maybeSingle();
  if (!req) return null;
  const [{ data: items }, { data: images }, { data: comments }, { data: questions }] = await Promise.all([
    supabase.from("v_request_items_brand").select(ITEM_COLS).eq("brand_id", brandId).eq("request_id", requestId).order("seq"),
    supabase.from("request_images").select("id, request_item_id, storage_path, source_url, sort_order").eq("brand_id", brandId).eq("request_id", requestId).order("sort_order"),
    supabase.from("comments").select("id, target_type, target_id, body_ko, created_at").eq("brand_id", brandId).eq("visibility", "brand").in("target_type", ["request", "request_item"]).order("created_at"),
    // CN 질문은 게이트 해제 뒤 한국어 뷰로만 (0038)
    supabase.from("v_cn_questions_brand").select("id, request_item_id, body_ko, options_ko, released_at, answer, answered_at").eq("brand_id", brandId).order("released_at"),
  ]);
  const its = (items ?? []) as BrandRequestItem[];
  const ids = new Set<string>([req.id, ...its.map((i) => i.id)]);
  return {
    request: { ...req, status: aggregateRequestStatus(its) },
    items: its,
    images: images ?? [],
    comments: (comments ?? []).filter((c) => ids.has(c.target_id)),
    questions: (questions ?? []).filter((q) => ids.has(q.request_item_id)),
  };
}

export async function countOpenBrandItems(brandId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("v_request_items_brand").select("id", { count: "exact", head: true }).eq("brand_id", brandId).not("status", "in", "(closed,cancelled)");
  return count ?? 0;
}

/** 요청 상세(디자인 v2.2): 항목별 살아 있는 제안 — "제안 보기"를 그 제안 상세로 바로 잇는다. v_offers_brand 뷰 id·상태만 */
export async function offersForRequestItems(brandId: string, itemIds: string[]) {
  if (!itemIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("v_offers_brand").select("id, request_item_id, status, issued_at").eq("brand_id", brandId).in("request_item_id", itemIds).order("issued_at", { ascending: false });
  return (data ?? []) as { id: string; request_item_id: string | null; status: string; issued_at: string }[];
}
