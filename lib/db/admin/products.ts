import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** 관리자 상품 쿼리 (A-03 검수 큐 · A-04 발행 대상). 서비스 롤. 호출 전 ADMIN 확인(레이아웃·액션). */

export async function listProductsForAdmin(statuses: string[]) {
  const db = createAdminClient();
  const { data } = await db
    .from("products")
    .select("id, code, status, category, name_zh, name_ko, owner_role, due_at, recheck_reason, created_by, vendor_id, source_request_item_id, updated_at, vendors(name, trust_score), product_images(storage_path, sort_order)")
    .in("status", statuses)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => {
    const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const vendor = Array.isArray(p.vendors) ? p.vendors[0] : p.vendors;
    return { ...p, cover: imgs[0]?.storage_path ?? null, vendorName: vendor?.name ?? null, trustScore: vendor?.trust_score ?? null };
  });
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
