import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * 브랜드 샘플 쿼리 (B-06·B-07). v_sample_*_brand · v_offers_brand · v_product_*_brand 뷰만 + brand_id 필터.
 * 검품 내부 메모·CN용 번역은 뷰에 없다.
 */
const SR_COLS =
  "id, status, owner_role, due_at, ship_to, logistics_fee_krw, product_fee_total_krw, payment_required, payment_reported_at, payment_confirmed_at, payment_note, cn_shipped_at, kr_arrived_at, inspected_at, kr_tracking, sent_at, delivered_at, feedback_due, return_due, created_at";
const SI_COLS =
  "id, sample_request_id, offer_id, variant_id, qty, status, feedback, feedback_note, feedback_reason, return_status, returned_at, return_tracking, return_requested_at, charge_status, charged_krw, charged_at, product_price_krw, inspection_photo_path, inspection_defect, inspected_at";

/** B-06: 샘플에 담을 수 있는 제안(관심·보류) + 상품·variant */
export async function listSampleCandidates(brandId: string) {
  const supabase = await createClient();
  const { data: offers } = await supabase
    .from("v_offers_brand")
    .select("id, product_id, status, sample_fee_product_krw, sample_logistics_krw, valid_until")
    .eq("brand_id", brandId)
    .in("status", ["interested", "hold"]);
  const ids = [...new Set((offers ?? []).map((o) => o.product_id))];
  if (!ids.length) return { offers: [], products: [], colors: [], sizes: [], variants: [], images: [] };
  const [{ data: products }, { data: colors }, { data: sizes }, { data: variants }, { data: images }] = await Promise.all([
    supabase.from("v_products_brand").select("id, code, name_ko").in("id", ids),
    supabase.from("v_product_colors_brand").select("id, product_id, name_ko, hex, sort_order").in("product_id", ids).order("sort_order"),
    supabase.from("v_product_sizes_brand").select("id, product_id, label, sort_order").in("product_id", ids).order("sort_order"),
    supabase.from("v_product_variants_brand").select("id, product_id, color_id, size_id").in("product_id", ids),
    supabase.from("v_product_images_brand").select("product_id, storage_path, kind, sort_order").in("product_id", ids).order("sort_order"),
  ]);
  return { offers: offers ?? [], products: products ?? [], colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], images: images ?? [] };
}

export async function listBrandSamples(brandId: string) {
  const supabase = await createClient();
  const [{ data: reqs }, { data: items }] = await Promise.all([
    supabase.from("v_sample_requests_brand").select(SR_COLS).eq("brand_id", brandId).order("created_at", { ascending: false }).limit(100),
    supabase.from("v_sample_items_brand").select("sample_request_id, qty, charge_status, charged_krw").eq("brand_id", brandId),
  ]);
  return (reqs ?? []).map((r) => {
    const its = (items ?? []).filter((i) => i.sample_request_id === r.id);
    return { ...r, qty: its.reduce((s, i) => s + i.qty, 0), charged: its.reduce((s, i) => s + (i.charge_status === "charged" ? i.charged_krw : 0), 0) };
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
  const [{ data: products }, { data: variants }, { data: colors }, { data: sizes }] = await Promise.all([
    productIds.length ? supabase.from("v_products_brand").select("id, code, name_ko").in("id", productIds) : Promise.resolve({ data: [] }),
    variantIds.length ? supabase.from("v_product_variants_brand").select("id, product_id, color_id, size_id").in("id", variantIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("v_product_colors_brand").select("id, name_ko").in("product_id", productIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("v_product_sizes_brand").select("id, label").in("product_id", productIds) : Promise.resolve({ data: [] }),
  ]);
  return { request: req, items: items ?? [], offers: offers ?? [], products: products ?? [], variants: variants ?? [], colors: colors ?? [], sizes: sizes ?? [] };
}

/** 수령 주소 기본값 (brands.default_address — 브랜드 멤버 RLS) */
export async function getBrandAddress(brandId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("default_address, tier").eq("id", brandId).maybeSingle();
  return { address: (data?.default_address ?? null) as { name?: string; phone?: string; address?: string } | null, tier: (data?.tier ?? "new") as "new" | "proven" };
}
