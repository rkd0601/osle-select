import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { kstDay } from "@/lib/offers";
import { canAddToSample } from "@/lib/samples";
import { productOpenForReaction } from "./products";

/**
 * 샘플 서버 헬퍼(서비스 롤). 브랜드 측 코드는 products를 직접 조회하지 않으므로(절대 규칙 1) 중량·샘플 가능 판정을 여기서 하고
 * 금액 계산용 값만 돌려준다 — 중량은 브랜드 응답으로 나가지 않는다.
 */
export async function resolveSampleLines(brandId: string, lines: { offerId: string; variantId: string; qty: number }[]) {
  const db = createAdminClient();
  const offerIds = [...new Set(lines.map((l) => l.offerId))];
  const { data: offers } = await db.from("offers").select("id, product_id, status, sample_fee_product_krw, valid_until, type, exclusive_until, price_tiers").eq("brand_id", brandId).in("id", offerIds);
  if (!offers || offers.length !== offerIds.length) return { error: "common.notFound" as const };
  const today = kstDay(new Date());
  for (const o of offers) {
    if (!canAddToSample(o.status)) return { error: "sample.error.offerState" as const };
    if (o.valid_until < today) return { error: "offer.error.expired" as const };
    if (!(await productOpenForReaction(o.product_id))) return { error: "common.notFound" as const };
  }
  const productIds = [...new Set(offers.map((o) => o.product_id))];
  const [{ data: products }, { data: variants }] = await Promise.all([
    db.from("products").select("id, weight_g, sample_ok").in("id", productIds),
    db.from("product_variants").select("id, product_id").in("id", lines.map((l) => l.variantId)),
  ]);
  const vmap = new Map((variants ?? []).map((v) => [v.id, v.product_id]));
  const omap = new Map(offers.map((o) => [o.id, o]));
  const pmap = new Map((products ?? []).map((p) => [p.id, p]));
  const cost: { offerId: string; variantId: string; qty: number; weight_g: number; product_price_krw: number }[] = [];
  for (const l of lines) {
    const o = omap.get(l.offerId)!;
    if (vmap.get(l.variantId) !== o.product_id) return { error: "common.forbidden" as const }; // 다른 상품의 variant
    const p = pmap.get(o.product_id);
    if (!p?.sample_ok) return { error: "sample.error.offerState" as const };
    // 미회수 시 청구할 상품가: 발행 시 고정값, 없으면(0016 이전 제안) 최소 tier 상품가. 0이면 거부 — 청구 0원으로 조용히 넘어가지 않는다 (r4 리뷰 4)
    const tiers = (o.price_tiers ?? []) as { min_qty: number; product_price_krw: number }[];
    const minTier = tiers.length ? Math.min(...tiers.map((t) => t.product_price_krw)) : 0;
    const price = o.sample_fee_product_krw ?? minTier;
    if (!(price > 0)) return { error: "common.error" as const };
    cost.push({ ...l, weight_g: p.weight_g ?? 0, product_price_krw: price });
  }
  return { offers, cost };
}

/** 출고 준비가 된 요청서의 상품 등록자(CN)에게 알림 (WeCom 연동은 8단계에서 notify 안에) */
export async function notifySampleCnOwners(sampleId: string) {
  const db = createAdminClient();
  const { data: items } = await db.from("sample_items").select("offer_id").eq("sample_request_id", sampleId);
  const offerIds = [...new Set((items ?? []).map((i) => i.offer_id))];
  if (!offerIds.length) return;
  const { data: offers } = await db.from("offers").select("product_id").in("id", offerIds);
  const { data: products } = await db.from("products").select("created_by").in("id", [...new Set((offers ?? []).map((o) => o.product_id))]);
  const ids = [...new Set((products ?? []).map((p) => p.created_by).filter(Boolean) as string[])];
  if (ids.length) await notify({ type: "sample.ready_to_ship", sampleId, cnIds: ids });
}

/** A-05 큐: 상태별 요청서 + 항목 집계 */
export async function listSamplesForAdmin() {
  const db = createAdminClient();
  const { data: reqs } = await db.from("sample_requests").select("id, brand_id, status, owner_role, due_at, payment_required, payment_reported_at, payment_confirmed_at, logistics_fee_krw, return_due, feedback_due, created_at, brands(name, slug)").not("status", "in", "(closed,cancelled)").order("due_at", { ascending: true, nullsFirst: false }).limit(300);
  // 열린 요청서의 항목만 (전체 테이블을 읽으면 1000행 상한에서 잘린다, 리뷰 8)
  const ids = (reqs ?? []).map((r) => r.id);
  const { data: items } = ids.length ? await db.from("sample_items").select("sample_request_id, qty, status, return_status, charge_status, return_requested_at").in("sample_request_id", ids) : { data: [] };
  return (reqs ?? []).map((r) => ({ ...r, items: (items ?? []).filter((i) => i.sample_request_id === r.id) }));
}

export async function getSampleForAdmin(sampleId: string) {
  const db = createAdminClient();
  const { data: req } = await db.from("sample_requests").select("*, brands(name, slug, tier)").eq("id", sampleId).maybeSingle();
  if (!req) return null;
  const { data: items } = await db.from("sample_items").select("*").eq("sample_request_id", sampleId).order("created_at");
  const offerIds = [...new Set((items ?? []).map((i) => i.offer_id))];
  const { data: offers } = offerIds.length ? await db.from("offers").select("id, product_id").in("id", offerIds) : { data: [] };
  const productIds = [...new Set((offers ?? []).map((o) => o.product_id))];
  const variantIds = (items ?? []).map((i) => i.variant_id);
  const [{ data: products }, { data: variants }, { data: colors }, { data: sizes }] = await Promise.all([
    productIds.length ? db.from("products").select("id, code, name_ko, name_zh, category, created_by").in("id", productIds) : Promise.resolve({ data: [] }),
    variantIds.length ? db.from("product_variants").select("id, product_id, color_id, size_id").in("id", variantIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("product_colors").select("id, name_ko, name_zh").in("product_id", productIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("product_sizes").select("id, product_id, label, measurements, source").in("product_id", productIds) : Promise.resolve({ data: [] }),
  ]);
  return { request: req, items: items ?? [], offers: offers ?? [], products: products ?? [], variants: variants ?? [], colors: colors ?? [], sizes: sizes ?? [] };
}
