import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { resolveInherited } from "@/lib/products";
import { feedbacksForProduct, orderEligible, orderInvoice, orderOptionLines, type FinalApproval, type InvoiceGroup } from "@/lib/orders";
import { kstDay } from "@/lib/offers";

/**
 * 발주 서버 헬퍼(서비스 롤). 브랜드 측 코드는 products를 직접 조회하지 않으므로(절대 규칙 1) 담기 판정·홀딩 조건·
 * 최소 수량·미회수 샘플을 여기서 모아 판정 결과와 금액만 돌려준다.
 */

/** 브랜드가 발주서에 담을 수 있는 제안 (관심 + 샘플 관심, 예외 리오더) */
export async function eligibleOffersForBrand(brandId: string, onlyIds?: string[], opts: { adminWaived?: boolean } = {}) {
  const db = createAdminClient();
  let q = db.from("offers").select("id, product_id, status, price_tiers, fee_rate, option_prices, valid_until").eq("brand_id", brandId).in("status", ["interested", "hold", "new"]);
  if (onlyIds) q = q.in("id", onlyIds);
  const { data: offers } = await q;
  if (!offers?.length) return [];
  const productIds = [...new Set(offers.map((o) => o.product_id))];
  const [{ data: samples }, { data: prior }, { data: products }] = await Promise.all([
    // 샘플 피드백은 (brand_id, product_id) 기준 — 만료 뒤 재발행된 제안도 같은 상품 샘플이 관심이면 통과 (DECISIONS r5-4)
    db.from("sample_items").select("feedback, offers!inner(product_id)").eq("brand_id", brandId).in("offers.product_id", productIds),
    db.from("order_lines").select("offer_id, orders!inner(status, brand_id)").eq("orders.brand_id", brandId).gt("qty", 0).in("orders.status", ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"]), // 수량 0으로 뺀 라인은 리오더 이력이 아니다 (r5 리뷰 10)
    db.from("products").select("id, status, min_qty, supply_type, lead_days, weight_g, hold_override, label_options_override, mod_options_override, sample_ok, vendor_id, vendors(default_hold, default_sample_ok, default_label_options, default_mod_options)").in("id", productIds),
  ]);
  const priorProducts = new Set<string>();
  if (prior?.length) {
    const { data: po } = await db.from("offers").select("product_id").in("id", prior.map((p) => p.offer_id));
    for (const p of po ?? []) priorProducts.add(p.product_id);
  }
  return offers.map((o) => {
    const p = (products ?? []).find((x) => x.id === o.product_id);
    const vendor = p ? ((Array.isArray(p.vendors) ? p.vendors[0] : p.vendors) ?? null) : null;
    const inh = p ? resolveInherited(p, vendor as never) : null;
    const fb = feedbacksForProduct((samples ?? []).map((s) => ({ product_id: ((Array.isArray(s.offers) ? s.offers[0] : s.offers) as { product_id: string } | null)?.product_id, feedback: s.feedback })), o.product_id);
    // 유효기간이 지난 제안은 고정 가격이 낡았다 → 재제안 필요 (7단계 리뷰 6, 샘플·반응과 같은 규칙)
    const open = (p?.status === "offering" || p?.status === "repool") && o.valid_until >= kstDay(new Date());
    return {
      offerId: o.id, productId: o.product_id, status: o.status, price_tiers: o.price_tiers, fee_rate: Number(o.fee_rate), option_prices: o.option_prices,
      eligible: open && orderEligible({ status: o.status, sampleFeedbacks: fb, hasReorder: priorProducts.has(o.product_id), adminWaived: opts.adminWaived }),
      gatePassed: orderEligible({ status: o.status, sampleFeedbacks: fb, hasReorder: priorProducts.has(o.product_id) }),
      minQty: p?.min_qty ?? null, supplyType: p?.supply_type ?? null, leadDays: p?.lead_days ?? null, weightG: p?.weight_g ?? 0, hold: inh?.hold ?? null,
    };
  });
}

/** 발주 1건 + 라인 + 제안 고정값 + 미회수 샘플(같은 상품, 차감 전) — 금액 계산용 */
export async function loadOrderForCalc(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*, brands(slug, name, credit_balance_krw)").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: lines } = await db.from("order_lines").select("*").eq("order_id", orderId);
  const offerIds = [...new Set((lines ?? []).map((l) => l.offer_id))];
  const { data: offers } = offerIds.length ? await db.from("offers").select("id, product_id, status, price_tiers, fee_rate, option_prices").in("id", offerIds) : { data: [] };
  // 담긴 제안이 재확인·재동의 중이면 price_tiers가 이미 새 값일 수 있다(approveProduct가 교체) — 돈이 걸린 단계는 브랜드 재동의 전까지 막는다 (검증 B-1)
  const offersChanged = (offers ?? []).some((o) => o.status === "recheck" || o.status === "reconsent_pending");
  const productIds = [...new Set((offers ?? []).map((o) => o.product_id))];
  const [{ data: products }, { data: kept }] = await Promise.all([
    productIds.length ? db.from("products").select("id, code, name_ko, name_zh, min_qty, weight_g, created_by, category, fabric, care_codes, origin").in("id", productIds) : Promise.resolve({ data: [] }),
    db.from("sample_items").select("id, offer_id, charged_krw, deducted_in_order_id, charge_status, offers!inner(product_id)").eq("brand_id", order.brand_id).eq("charge_status", "charged").is("deducted_in_order_id", null),
  ]);
  const groups: InvoiceGroup[] = (offers ?? []).map((o) => ({
    offerId: o.id, price_tiers: o.price_tiers, fee_rate: Number(o.fee_rate),
    // 수량 확정 뒤에는 브랜드가 정한 qty(0 포함)만 쓴다 — 0을 확보 수량으로 되돌리면 빼둔 라인이 청구된다
    lines: (lines ?? []).filter((l) => l.offer_id === o.id).map((l) => ({ lineId: l.id, qty: order.qty_confirmed_at ? l.qty : (l.confirmed_qty ?? l.expected_qty) })),
  }));
  // 미회수 샘플은 "같은 상품"의 제안이면 차감 — 샘플을 받은 제안과 발주 제안이 달라도(재제안) 상품이 같으면 차감
  const keptSamples = (kept ?? []).flatMap((k) => {
    const pid = ((Array.isArray(k.offers) ? k.offers[0] : k.offers) as { product_id: string } | null)?.product_id;
    const target = (offers ?? []).find((o) => o.product_id === pid);
    return target ? [{ sampleItemId: k.id, offerId: target.id, charged_krw: k.charged_krw, already_deducted: false }] : [];
  });
  // 실적(proven) 브랜드 샘플은 선입금 없이 출고됐다 → 이 발주 상품이 들어 있던 요청서의 물류비를 확정 때 1회 합산 (r4 #3)
  const { data: unbilled } = await db
    .from("sample_requests")
    .select("id, logistics_fee_krw, sample_items(offer_id, offers(product_id))")
    .eq("brand_id", order.brand_id).eq("payment_required", false).is("logistics_billed_order_id", null).neq("status", "cancelled");
  const pids = new Set(productIds);
  const sampleLogistics = (unbilled ?? []).flatMap((sr) => {
    const items = (sr.sample_items ?? []) as { offers: { product_id: string } | { product_id: string }[] | null }[];
    const hit = items.some((i) => { const o = Array.isArray(i.offers) ? i.offers[0] : i.offers; return !!o && pids.has(o.product_id); });
    return hit && sr.logistics_fee_krw > 0 ? [{ sampleRequestId: sr.id, krw: sr.logistics_fee_krw }] : [];
  });
  return { order, lines: lines ?? [], offers: offers ?? [], products: products ?? [], groups, keptSamples, sampleLogistics, offersChanged };
}

/**
 * 최종 견적 청구 계산 — 관리자 확정(confirmOrder)·브랜드 미리보기·브랜드 동의가 **같은 함수**를 써서 총액이 어긋나지 않게 한다 (u-10).
 * 선점 전(draft) 금액. 크레딧은 확정 때 원자적으로 쓰므로 여기엔 없다.
 */
export function finalInvoiceParts(calc: NonNullable<Awaited<ReturnType<typeof loadOrderForCalc>>>) {
  const o = calc.order;
  const qtyByOffer = new Map(calc.groups.map((g) => [g.offerId, g.lines.reduce((n, l) => n + l.qty, 0)]));
  const options = orderOptionLines({
    optionPrices: calc.offers.map((x) => ({ offerId: x.id, option_prices: x.option_prices })),
    labels: (o.label_selections ?? []) as { offerId: string; type: string; qty: number }[],
    mods: (o.mod_requests ?? []) as { offerId: string; item: string }[],
    qtyByOffer,
  });
  const base = { groups: calc.groups, options, deposit_paid_krw: o.deposit_confirmed_at ? (o.deposit_krw ?? 0) : 0, logistics_final_krw: o.logistics_quote_final_krw };
  const draft = orderInvoice({ ...base, keptSamples: calc.keptSamples, sample_logistics: calc.sampleLogistics });
  return { options, base, draft };
}

/** 가장 최근 최종 견적 동의(감사 로그). 브랜드 세션은 audit_logs를 못 읽으므로 서버(서비스 롤)에서만 */
export async function latestFinalApproval(orderId: string): Promise<FinalApproval | null> {
  const { data } = await createAdminClient().from("audit_logs").select("created_at, diff, on_behalf_of_brand_id")
    .eq("entity", "order").eq("entity_id", orderId).eq("action", "order.final_approve").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const total = Number((data.diff as { total_krw?: unknown } | null)?.total_krw);
  return Number.isFinite(total) ? { at: data.created_at, total_krw: total, onBehalf: !!data.on_behalf_of_brand_id } : null;
}

export async function notifyOrderCnOwners(orderId: string, type: "order.stock_check" | "order.ship") {
  const db = createAdminClient();
  const { data: lines } = await db.from("order_lines").select("offer_id").eq("order_id", orderId);
  const { data: offers } = await db.from("offers").select("product_id").in("id", [...new Set((lines ?? []).map((l) => l.offer_id))]);
  const { data: products } = await db.from("products").select("created_by").in("id", [...new Set((offers ?? []).map((o) => o.product_id))]);
  const ids = [...new Set((products ?? []).map((p) => p.created_by).filter(Boolean) as string[])];
  if (ids.length) await notify({ type, orderId, cnIds: ids });
}

export async function listOrdersForAdmin() {
  // 진행 중 전부 + 검수 보고가 끝났지만 크레딧 처리 전인 건 (취소 제외)
  const { data } = await createAdminClient()
    .from("orders")
    .select("id, brand_id, status, owner_role, due_at, hold_choice, deposit_krw, deposit_reported_at, deposit_confirmed_at, credit_issued_krw, created_at, brands(name, slug), order_lines(expected_qty, qty, backorder_status)")
    .neq("status", "cancelled")
    .or("status.neq.report_done,credit_issued_krw.eq.0")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);
  return data ?? [];
}

/** A-06 상세: 금액 계산 묶음 + variant 라벨 + 검품 기록 + 감사 로그 */
export async function getOrderForAdmin(orderId: string) {
  const calc = await loadOrderForCalc(orderId);
  if (!calc) return null;
  const db = createAdminClient();
  const productIds = calc.products.map((p) => p.id);
  const [{ data: variants }, { data: colors }, { data: sizes }, { data: inspection }, { data: logs }] = await Promise.all([
    db.from("product_variants").select("id, product_id, color_id, size_id").in("id", calc.lines.map((l) => l.variant_id)),
    productIds.length ? db.from("product_colors").select("id, product_id, name_ko, name_zh").in("product_id", productIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("product_sizes").select("id, product_id, label").in("product_id", productIds) : Promise.resolve({ data: [] }),
    calc.order.inspection_id ? db.from("inspections").select("id, results, defect_qty, info_match_rate, inspected_at").eq("id", calc.order.inspection_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("audit_logs").select("action, diff, created_at").eq("entity", "order").eq("entity_id", orderId).order("created_at", { ascending: false }).limit(30),
  ]);
  return { ...calc, variants: variants ?? [], colors: colors ?? [], sizes: sizes ?? [], inspection, logs: logs ?? [] };
}
