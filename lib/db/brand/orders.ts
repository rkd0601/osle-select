import "server-only";
import { createClient } from "@/lib/supabase/server";
import { orderEligible } from "@/lib/orders";

/**
 * 브랜드 발주 쿼리 (B-08·B-09). v_orders_brand · v_order_lines_brand · v_offers_brand · v_product_*_brand 뷰만 + brand_id 필터.
 * 담기 판정은 화면 표시용(서버 액션이 같은 함수로 다시 판정한다). 중량·원가는 뷰에 없다.
 */
const O_COLS =
  "id, status, owner_role, due_at, gb_open_date, gb_close_date, delivery_promise_date, hold_choice, hold_ack, deposit_pct, deposit_krw, deposit_reported_at, deposit_confirmed_at, deposit_note, route, logistics_quote_range, logistics_quote_final_krw, quote_note, label_selections, mod_requests, invoice_snapshot, confirmed_at, cn_shipped_at, kr_inspected_at, sent_at, delivered_at, report_due, report, report_submitted_at, credit_issued_krw, quoted_at, qty_confirmed_at, final_quoted_at, kr_tracking, created_at";
const L_COLS = "id, order_id, offer_id, variant_id, expected_qty, qty, unit_price_krw, stock_result, confirmed_qty, backorder_status, backorder_qty, backorder_eta, backorder_log, defect_qty, inspected_ok_qty";
const DONE = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"];

async function productBundle(productIds: string[]) {
  const supabase = await createClient();
  if (!productIds.length) return { products: [], colors: [], sizes: [], variants: [], images: [] };
  const [{ data: products }, { data: colors }, { data: sizes }, { data: variants }, { data: images }] = await Promise.all([
    supabase.from("v_products_brand").select("id, code, name_ko, status, min_qty, supply_type, lead_days, hold").in("id", productIds),
    supabase.from("v_product_colors_brand").select("id, product_id, name_ko, hex, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_sizes_brand").select("id, product_id, label, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_variants_brand").select("id, product_id, color_id, size_id").in("product_id", productIds),
    supabase.from("v_product_images_brand").select("product_id, storage_path, kind, sort_order").in("product_id", productIds).order("sort_order"),
  ]);
  return { products: products ?? [], colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], images: images ?? [] };
}

/** B-08 1단계: 관심 제안 + 담기 판정(샘플 관심 또는 리오더) */
export async function listOrderCandidates(brandId: string) {
  const supabase = await createClient();
  const { data: offers } = await supabase
    .from("v_offers_brand")
    .select("id, product_id, status, price_tiers, fee_rate, option_prices, valid_until")
    .eq("brand_id", brandId)
    .eq("status", "interested");
  if (!offers?.length) return { offers: [], ...(await productBundle([])) };
  const [{ data: samples }, { data: done }] = await Promise.all([
    supabase.from("v_sample_items_brand").select("offer_id, feedback").eq("brand_id", brandId).in("offer_id", offers.map((o) => o.id)),
    supabase.from("v_orders_brand").select("id").eq("brand_id", brandId).in("status", DONE),
  ]);
  const { data: doneLines } = done?.length ? await supabase.from("v_order_lines_brand").select("offer_id").eq("brand_id", brandId).in("order_id", done.map((d) => d.id)) : { data: [] };
  const { data: doneOffers } = doneLines?.length ? await supabase.from("v_offers_brand").select("product_id").eq("brand_id", brandId).in("id", [...new Set(doneLines.map((l) => l.offer_id))]) : { data: [] };
  const reorder = new Set((doneOffers ?? []).map((o) => o.product_id));
  const bundle = await productBundle([...new Set(offers.map((o) => o.product_id))]);
  return {
    ...bundle,
    offers: offers.map((o) => ({
      ...o,
      eligible: orderEligible({ status: o.status, sampleFeedbacks: (samples ?? []).filter((s) => s.offer_id === o.id).map((s) => s.feedback), hasReorder: reorder.has(o.product_id) }),
      reorder: reorder.has(o.product_id),
    })),
  };
}

export async function listBrandOrders(brandId: string) {
  const supabase = await createClient();
  const [{ data: orders }, { data: lines }] = await Promise.all([
    supabase.from("v_orders_brand").select("id, status, owner_role, due_at, gb_close_date, delivery_promise_date, hold_choice, invoice_snapshot, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(100),
    supabase.from("v_order_lines_brand").select("order_id, expected_qty, qty, confirmed_qty, backorder_status").eq("brand_id", brandId),
  ]);
  return (orders ?? []).map((o) => {
    const ls = (lines ?? []).filter((l) => l.order_id === o.id);
    return {
      ...o,
      qty: ls.reduce((s, l) => s + (l.qty || l.confirmed_qty || l.expected_qty), 0),
      backorders: ls.filter((l) => l.backorder_status === "backordered").length,
      total: ((o.invoice_snapshot ?? null) as { total_krw?: number } | null)?.total_krw ?? null,
    };
  });
}

export async function getBrandOrder(brandId: string, orderId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("v_orders_brand").select(O_COLS).eq("brand_id", brandId).eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: lines } = await supabase.from("v_order_lines_brand").select(L_COLS).eq("brand_id", brandId).eq("order_id", orderId);
  const offerIds = [...new Set((lines ?? []).map((l) => l.offer_id))];
  const { data: offers } = offerIds.length
    ? await supabase.from("v_offers_brand").select("id, product_id, price_tiers, fee_rate, option_prices").eq("brand_id", brandId).in("id", offerIds)
    : { data: [] };
  const bundle = await productBundle([...new Set((offers ?? []).map((o) => o.product_id))]);
  return { order, lines: lines ?? [], offers: offers ?? [], ...bundle };
}
