import "server-only";
import { createClient } from "@/lib/supabase/server";
import { bundleOf, productNamesByOffer } from "./titles";
import { sampleBillingDue } from "@/lib/samples";

/**
 * 브랜드 샘플 쿼리 (B-06·B-07). v_sample_*_brand · v_offers_brand · v_product_*_brand 뷰만 + brand_id 필터.
 * 검품 내부 메모·CN용 번역은 뷰에 없다.
 */
const SR_COLS =
  "id, requested_by, status, owner_role, due_at, ship_to, logistics_fee_krw, product_fee_total_krw, payment_required, payment_reported_at, payment_confirmed_at, payment_note, cn_shipped_at, kr_arrived_at, inspected_at, kr_tracking, sent_at, delivered_at, feedback_due, return_due, created_at";
const SI_COLS =
  "id, sample_request_id, offer_id, variant_id, qty, status, feedback, feedback_note, feedback_reason, return_status, returned_at, return_tracking, return_requested_at, charge_status, charged_krw, charged_at, product_price_krw, inspection_photo_path, inspection_defect, inspected_at";

/** B-06: 샘플에 담을 수 있는 제안(관심·보류) + 상품·variant */
export async function listSampleCandidates(brandId: string) {
  const supabase = await createClient();
  const { data: offers } = await supabase
    .from("v_offers_brand")
    .select("id, product_id, status, sample_fee_product_krw, sample_logistics_krw, valid_until, price_tiers, fee_rate")
    .eq("brand_id", brandId)
    .in("status", ["interested", "hold"]);
  const ids = [...new Set((offers ?? []).map((o) => o.product_id))];
  if (!ids.length) return { offers: [], products: [], colors: [], sizes: [], variants: [], images: [] };
  const [{ data: products }, { data: colors }, { data: sizes }, { data: variants }, { data: images }] = await Promise.all([
    supabase.from("v_products_brand").select("id, code, name_ko").in("id", ids),
    supabase.from("v_product_colors_brand").select("id, product_id, name_ko, hex, sort_order").in("product_id", ids).order("sort_order"),
    supabase.from("v_product_sizes_brand").select("id, product_id, label, sort_order").in("product_id", ids).order("sort_order"),
    supabase.from("v_product_variants_brand").select("id, product_id, color_id, size_id").in("product_id", ids),
    supabase.from("v_product_images_brand").select("id, product_id, storage_path, kind, sort_order").in("product_id", ids).order("sort_order").order("id"),
  ]);
  return { offers: offers ?? [], products: products ?? [], colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], images: images ?? [] };
}

export async function listBrandSamples(brandId: string) {
  const supabase = await createClient();
  const [{ data: reqs }, { data: items }, billed] = await Promise.all([
    supabase.from("v_sample_requests_brand").select(SR_COLS).eq("brand_id", brandId).order("created_at", { ascending: false }).limit(100),
    supabase.from("v_sample_items_brand").select("sample_request_id, offer_id, qty, return_status, charge_status, charged_krw, product_price_krw").eq("brand_id", brandId),
    // 0059: 후불 물류비가 발주 청구에 붙었는지 — 0059 전 DB면 칼럼 오류 → 붙은 것 없음으로 본다
    supabase.from("v_sample_requests_brand").select("id, logistics_billed_order_id").eq("brand_id", brandId).not("logistics_billed_order_id", "is", null),
  ]);
  const billedIds = new Set(billed.error ? [] : ((billed.data ?? []) as unknown as { id: string }[]).map((x) => x.id));
  const names = await productNamesByOffer(brandId, (items ?? []).map((i) => i.offer_id));
  return (reqs ?? []).map((r) => {
    const its = (items ?? []).filter((i) => i.sample_request_id === r.id);
    // 청구 예정(S6): 후불 물류비(아직 발주 청구에 안 붙은 것) + 구매(확정·선택) — 홈·청구 같은 기준(lib/samples.sampleBillingDue)
    const due = sampleBillingDue({ ...r, logistics_billed_order_id: billedIds.has(r.id) ? r.id : null }, its);
    return { ...r, ...bundleOf(its.map((i) => i.offer_id), names), qty: its.reduce((s, i) => s + i.qty, 0), charged: its.reduce((s, i) => s + (i.charge_status === "charged" ? i.charged_krw : 0), 0), due };
  });
}

export async function getBrandSample(brandId: string, sampleId: string) {
  const supabase = await createClient();
  const { data: req } = await supabase.from("v_sample_requests_brand").select(SR_COLS).eq("brand_id", brandId).eq("id", sampleId).maybeSingle();
  if (!req) return null;
  const { data: items } = await supabase.from("v_sample_items_brand").select(SI_COLS).eq("brand_id", brandId).eq("sample_request_id", sampleId).order("created_at");
  const offerIds = [...new Set((items ?? []).map((i) => i.offer_id))];
  const { data: offers } = offerIds.length ? await supabase.from("v_offers_brand").select("id, product_id, status").eq("brand_id", brandId).in("id", offerIds) : { data: [] };
  const productIds = [...new Set((offers ?? []).map((o) => o.product_id))];
  const variantIds = (items ?? []).map((i) => i.variant_id);
  const [{ data: products }, { data: variants }, { data: colors }, { data: sizes }, { data: images }, { data: lines }] = await Promise.all([
    productIds.length ? supabase.from("v_products_brand").select("id, code, name_ko").in("id", productIds) : Promise.resolve({ data: [] }),
    variantIds.length ? supabase.from("v_product_variants_brand").select("id, product_id, color_id, size_id").in("id", variantIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("v_product_colors_brand").select("id, name_ko").in("product_id", productIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("v_product_sizes_brand").select("id, label").in("product_id", productIds) : Promise.resolve({ data: [] }),
    // 상세 썸네일(디자인 v2.2 `.nowblock`·옵션 행) — 상품 대표 사진 경로만
    // 대표 사진 = CN 편집 화면 1번(sort_order 가장 작은 것, 같으면 id) — 디자인 v2.3 T4
    productIds.length ? supabase.from("v_product_images_brand").select("product_id, storage_path, kind, sort_order").in("product_id", productIds).order("sort_order").order("id") : Promise.resolve({ data: [] }),
    // "내 피드백 · 관심 · 발주서에 담김"(v2.3 T1) — 이 제안이 들어간 발주 줄(취소 발주 제외는 아래에서)
    offerIds.length ? supabase.from("v_order_lines_brand").select("offer_id, order_id").eq("brand_id", brandId).in("offer_id", offerIds).gt("qty", 0) : Promise.resolve({ data: [] }),
  ]);
  const orderIds = [...new Set((lines ?? []).map((l) => l.order_id))];
  const { data: liveOrders } = orderIds.length ? await supabase.from("v_orders_brand").select("id").eq("brand_id", brandId).in("id", orderIds).neq("status", "cancelled") : { data: [] };
  const live = new Set((liveOrders ?? []).map((o) => o.id));
  const orderedOfferIds = [...new Set((lines ?? []).filter((l) => live.has(l.order_id)).map((l) => l.offer_id))];
  return { request: req, items: items ?? [], offers: offers ?? [], products: products ?? [], variants: variants ?? [], colors: colors ?? [], sizes: sizes ?? [], images: (images ?? []) as { product_id: string; storage_path: string; kind: string; sort_order: number }[], orderedOfferIds };
}

/** 수령 주소 기본값 (brands.default_address — 브랜드 멤버 RLS) */
/**
 * 구매한(돌려보내지 않은) 샘플이 있는 상품 id — 발주 견적서에 "샘플값은 따로 청구" 안내를 띄울지 (PRD D13, 2026-11-09).
 * v_sample_items_brand · v_offers_brand 뷰만 + brand_id 필터.
 */
export async function keptSampleProductIds(brandId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data: items } = await supabase.from("v_sample_items_brand").select("offer_id").eq("brand_id", brandId).eq("return_status", "kept");
  const offerIds = [...new Set((items ?? []).map((i) => i.offer_id as string))];
  if (!offerIds.length) return new Set();
  const { data: offers } = await supabase.from("v_offers_brand").select("product_id").eq("brand_id", brandId).in("id", offerIds);
  return new Set((offers ?? []).map((o) => o.product_id as string));
}

export async function getBrandAddress(brandId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("default_address, tier").eq("id", brandId).maybeSingle();
  return { address: (data?.default_address ?? null) as { name?: string; phone?: string; address?: string } | null, tier: (data?.tier ?? "new") as "new" | "proven" };
}
