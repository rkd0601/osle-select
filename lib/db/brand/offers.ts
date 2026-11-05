import "server-only";
import { createClient } from "@/lib/supabase/server";
import { offerProgress, type OfferOrderRow, type OfferProgress, type OfferSampleRow } from "@/lib/brand-state";

/**
 * 브랜드 제안 쿼리 (B-04 라인시트 · B-05 상품 상세). v_*_brand 뷰만(CLAUDE.md 절대 규칙 1) + brand_id 필터(규칙 2).
 * 원가·원청·녹인 마진·환율·중량·중국어 원문은 뷰에 없다. 가격은 offer의 price_tiers·fee_rate·option_prices로만.
 */
const OFFER_COLS =
  "id, product_id, request_item_id, type, status, reaction, decline_reason, decline_note, price_tiers, fee_rate, sample_fee_product_krw, sample_logistics_krw, option_prices, valid_until, exclusive_until, issued_at, admin_comment";
const PRODUCT_COLS = "id, code, category, name_ko, desc_ko, fabric, origin, care_codes, quality_note_ko, supply_type, lead_days, production_moq, min_qty, sample_ok, verified_in_person, verified_at, hold";

export type BrandOffer = {
  id: string; product_id: string; request_item_id: string | null; type: "request" | "reoffer" | "recommend"; status: string;
  reaction: string | null; decline_reason: string | null; decline_note: string | null;
  price_tiers: { min_qty: number; product_price_krw: number }[]; fee_rate: number;
  sample_fee_product_krw: number | null; sample_logistics_krw: number | null;
  option_prices: { labels: { type: string; moq: number; unit_price_krw: number; lead_days: number }[]; mods: { item: string; moq: number; price_krw: number; lead_days: number }[] };
  valid_until: string; exclusive_until: string | null; issued_at: string; admin_comment: string | null;
};

async function productBundle(productIds: string[]) {
  const supabase = await createClient();
  if (!productIds.length) return { products: [], images: [], colors: [], sizes: [] };
  const [{ data: products }, { data: images }, { data: colors }, { data: sizes }] = await Promise.all([
    supabase.from("v_products_brand").select(PRODUCT_COLS).in("id", productIds),
    supabase.from("v_product_images_brand").select("id, product_id, storage_path, kind, source, usable_for_sales, sort_order, color_id").in("product_id", productIds).order("sort_order").order("id"),
    supabase.from("v_product_colors_brand").select("id, product_id, name_ko, hex, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_sizes_brand").select("id, product_id, label, measurements, source, sort_order").in("product_id", productIds).order("sort_order"),
  ]);
  return { products: products ?? [], images: images ?? [], colors: colors ?? [], sizes: sizes ?? [] };
}

/** B-04: 요청 → 항목별 제안 묶음 + 추천 제안. 만료 제안은 접어서 뒤로. */
export async function listBrandOffers(brandId: string) {
  const supabase = await createClient();
  const [{ data: offers }, { data: items }, { data: reqs }] = await Promise.all([
    supabase.from("v_offers_brand").select(OFFER_COLS).eq("brand_id", brandId).order("issued_at", { ascending: false }).limit(300),
    supabase.from("v_request_items_brand").select("id, request_id, seq, description, target_price_krw, status").eq("brand_id", brandId),
    supabase.from("v_requests_brand").select("id, title, created_at").eq("brand_id", brandId),
  ]);
  const list = (offers ?? []) as BrandOffer[];
  const bundle = await productBundle([...new Set(list.map((o) => o.product_id))]);
  return { offers: list, items: items ?? [], requests: reqs ?? [], ...bundle };
}

/** B-05: 제안 1건 + 상품 전체 정보. 다른 브랜드 제안·없는 id는 null → 404 */
export async function getBrandOffer(brandId: string, offerId: string) {
  const supabase = await createClient();
  const { data: offer } = await supabase.from("v_offers_brand").select(OFFER_COLS).eq("brand_id", brandId).eq("id", offerId).maybeSingle();
  if (!offer) return null;
  const bundle = await productBundle([offer.product_id]);
  const product = bundle.products[0];
  if (!product) return null;
  return { offer: offer as BrandOffer, product, images: bundle.images, colors: bundle.colors, sizes: bundle.sizes };
}

/** 제안 상세 메타 "{요청명} {n}번 항목" (디자인 v2.2) — 요청 항목·요청 뷰에서 번호·제목만 */
export async function getOfferRequestContext(brandId: string, requestItemId: string | null) {
  if (!requestItemId) return null;
  const supabase = await createClient();
  const { data: item } = await supabase.from("v_request_items_brand").select("id, request_id, seq").eq("brand_id", brandId).eq("id", requestItemId).maybeSingle();
  if (!item) return null;
  const { data: req } = await supabase.from("v_requests_brand").select("id, title").eq("brand_id", brandId).eq("id", item.request_id).maybeSingle();
  return { requestId: item.request_id as string, seq: item.seq as number, title: (req?.title ?? null) as string | null };
}

/**
 * 제안 상세 행동 블록(7차 검증 O1): 이 제안의 샘플 요청서·발주서 — v_sample_items_brand · v_sample_requests_brand · v_order_lines_brand · v_orders_brand만,
 * 모두 brand_id 필터(규칙 1·2). 계산은 lib/brand-state.offerProgress.
 */
export async function getOfferProgress(brandId: string, offerId: string): Promise<OfferProgress | null> {
  const supabase = await createClient();
  const [{ data: sitems }, { data: lines }] = await Promise.all([
    supabase.from("v_sample_items_brand").select("sample_request_id, return_status, return_requested_at").eq("brand_id", brandId).eq("offer_id", offerId),
    supabase.from("v_order_lines_brand").select("order_id, qty, expected_qty").eq("brand_id", brandId).eq("offer_id", offerId),
  ]);
  const srIds = [...new Set((sitems ?? []).map((s) => s.sample_request_id as string))];
  const orderIds = [...new Set((lines ?? []).map((l) => l.order_id as string))];
  const [{ data: srs }, { data: ords }] = await Promise.all([
    srIds.length
      ? supabase.from("v_sample_requests_brand").select("id, status, created_at, due_at, delivered_at, payment_reported_at, payment_confirmed_at").eq("brand_id", brandId).in("id", srIds)
      : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from("v_orders_brand").select("id, status, created_at").eq("brand_id", brandId).in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const samples: OfferSampleRow[] = ((srs ?? []) as Omit<OfferSampleRow, "items">[]).map((s) => ({
    ...s,
    items: (sitems ?? []).filter((i) => i.sample_request_id === s.id).map((i) => ({ return_status: i.return_status as string | null, return_requested_at: i.return_requested_at as string | null })),
  }));
  const orders: OfferOrderRow[] = ((ords ?? []) as { id: string; status: string; created_at: string }[]).map((o) => ({
    ...o,
    qty: (lines ?? []).filter((l) => l.order_id === o.id).reduce((n, l) => n + ((l.qty as number | null) || (l.expected_qty as number | null) || 0), 0),
  }));
  return offerProgress(samples, orders);
}
