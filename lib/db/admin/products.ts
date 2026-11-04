import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** 관리자 상품 쿼리 (A-03 검수 큐 · A-04 발행 대상). 서비스 롤. 호출 전 ADMIN 확인(레이아웃·액션). */

export async function listProductsForAdmin(statuses: string[], limit = 200) {
  const db = createAdminClient();
  const { data } = await db
    .from("products")
    .select("id, code, status, category, name_zh, name_ko, owner_role, due_at, recheck_reason, created_by, vendor_id, source_request_item_id, updated_at, vendors(name, trust_score), product_images(storage_path, sort_order)")
    .in("status", statuses)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((p) => {
    const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
    return { ...p, cover: imgs[0]?.storage_path ?? null, vendorName: vendor?.name ?? null, trustScore: vendor?.trust_score ?? null };
  });
}

/** A-04 목록 표시용: 상품별 발행 제안 수·관심 수 (가격·원가 없음) */
export async function offerStatsByProduct(productIds: string[]) {
  const out = new Map<string, { total: number; interested: number; live: number }>();
  if (!productIds.length) return out;
  const { data } = await createAdminClient().from("offers").select("product_id, status").in("product_id", productIds).limit(5000);
  for (const o of data ?? []) {
    const s = out.get(o.product_id) ?? { total: 0, interested: 0, live: 0 };
    s.total++;
    if (o.status === "interested") s.interested++;
    if (["new", "interested", "hold", "reconsent_pending"].includes(o.status)) s.live++;
    out.set(o.product_id, s);
  }
  return out;
}

/** 브랜드 목록 + 마진·수수료 오버라이드 (A-04 미리보기) */
export async function listBrandsForIssue() {
  const { data } = await createAdminClient().from("brands").select("id, name, slug, fee_rate, hidden_margin_rate, status").eq("status", "active").order("name");
  return data ?? [];
}

/** 브랜드의 열린 요청 항목 (A-04 항목 선택) */
export async function listOpenItemsForBrand(brandId: string) {
  const { data } = await createAdminClient()
    .from("request_items")
    .select("id, seq, description, target_price_krw, status, requests(title)")
    .eq("brand_id", brandId)
    .in("status", ["assigned", "sourcing", "offered", "selected"])
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((i) => ({ ...i, requestTitle: (Array.isArray(i.requests) ? i.requests[0] : i.requests)?.title ?? "" }));
}

/** 상품에 걸린 제안 전부 (A-04 이력·독점 판정) */
export async function listOffersForProduct(productId: string) {
  const { data } = await createAdminClient()
    .from("offers")
    .select("id, brand_id, request_item_id, type, status, price_tiers, fee_rate, exclusive_until, valid_until, issued_at, decline_reason, decline_note, brands(name, slug)")
    .eq("product_id", productId)
    .order("issued_at", { ascending: false });
  return data ?? [];
}

/** 요청 항목 → 브랜드 (A-04 기본 선택: products.source_request_item_id) */
export async function getItemBrand(itemId: string) {
  const { data } = await createAdminClient().from("request_items").select("id, brand_id").eq("id", itemId).maybeSingle();
  return data;
}

/**
 * 브랜드 반응 액션이 쓰는 상품 가용성 판정(서비스 롤). 브랜드 측 코드는 products를 직접 조회하지 않으므로(절대 규칙 1) 여기서 상태만 돌려준다.
 * offering/repool 이 아니면(재확인·비공개·반려) 브랜드 반응을 받지 않는다 — recheck 캐스케이드가 건드리지 않는 declined 제안의 되살리기까지 닫는다.
 */
export async function productOpenForReaction(productId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("products").select("status").eq("id", productId).maybeSingle();
  return !!data && (data.status === "offering" || data.status === "repool");
}
