/**
 * 발주 순수 로직 (B-08·A-06·B-09, PRD D9·D14·4·7장, 기획서 §10 F5). 가격 계산은 lib/pricing만 쓴다(절대 규칙 5).
 * 체인 순서는 전이 테이블(lib/transitions order)이 강제하고, 여기서는 단계별 입력·집계·금액을 판정한다.
 */
import { z } from "zod";
import { canAddToOrder } from "./transitions";
import { ceil10, depositKrw, pickTier, supplyPriceKrw, type PriceTier } from "./pricing";

// ---------- 1단계 예약 ----------
export const ReserveInput = z.object({
  gbOpen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gbClose: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryPromise: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.object({ offerId: z.guid(), variantId: z.guid(), expectedQty: z.number().int().min(0).max(100_000) })).min(1).max(200)
    .refine((ls) => ls.some((l) => l.expectedQty > 0), { message: "order.error.empty" })
    .refine((ls) => new Set(ls.map((l) => l.variantId)).size === ls.length, { message: "common.invalid" }),
  holdChoice: z.enum(["deposit", "none"]),
  holdAck: z.boolean(),
  modRequests: z.array(z.object({ offerId: z.guid(), item: z.string().max(20), note: z.string().trim().max(200).optional().or(z.literal("")) })).max(20).default([]),
}).refine((v) => v.gbOpen < v.gbClose, { message: "order.error.dates", path: ["gbClose"] })
  .refine((v) => v.holdChoice === "deposit" || v.holdAck, { message: "order.error.holdAck", path: ["holdAck"] });
export type ReserveInput = z.infer<typeof ReserveInput>;

/** 담기 판정 (절대 규칙 7): 제안 관심 AND 그 제안의 샘플 피드백 관심. 예외 리오더·관리자 면제 */
export function orderEligible(o: { status: string; sampleFeedbacks: (string | null)[]; hasReorder: boolean; adminWaived?: boolean }) {
  return canAddToOrder({
    offer_reaction: o.status,
    sample_feedback: o.sampleFeedbacks.includes("interested") ? "interested" : (o.sampleFeedbacks.find(Boolean) as "hold" | "declined" | undefined) ?? null,
    has_reorder_history: o.hasReorder,
    admin_waived: !!o.adminWaived,
  });
}

const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
/**
 * 일정 검증 (F5): 배송 약속일 − 마감 ≥ 리드타임 + 물류일. 미달은 경고, 생산(production)이면 차단.
 * 반환: { block: i18n 키 | null, warnings: i18n 키[] }
 */
export function scheduleCheck(v: { gbClose: string; deliveryPromise: string }, products: { supply_type: string | null; lead_days: number | null }[], logisticsDays: number) {
  const gap = days(v.gbClose, v.deliveryPromise);
  const warnings: string[] = [];
  let block: string | null = null;
  for (const p of products) {
    const need = (p.lead_days ?? 0) + logisticsDays;
    if (gap < need) {
      if (p.supply_type === "production") block = "order.error.scheduleProduction";
      else warnings.push("order.warn.schedule");
    }
  }
  return { block, warnings: [...new Set(warnings)] };
}

/** 상품별 예상·확정 수량 ≥ 최소 수량 */
export function belowMinQty(groups: { offerId: string; qty: number; minQty: number | null }[]) {
  return groups.filter((g) => g.qty > 0 && g.minQty != null && g.qty < g.minQty).map((g) => g.offerId);
}

// ---------- 재고 확인 (CN) ----------
/** 라인 응답 집계 → 다음 상태. 하나라도 pending이면 null(아직) */
export function stockAggregate(lines: { stock_result: string }[]): "stock_confirmed" | "partial_confirmed" | "stock_short" | null {
  if (!lines.length || lines.some((l) => l.stock_result === "pending")) return null;
  if (lines.every((l) => l.stock_result === "confirmed")) return "stock_confirmed";
  if (lines.every((l) => l.stock_result === "short")) return "stock_short";
  return "partial_confirmed";
}
export const StockResponse = z.array(z.object({
  lineId: z.guid(), result: z.enum(["confirmed", "short"]), confirmedQty: z.number().int().min(0).max(100_000), note: z.string().trim().max(200).optional().or(z.literal("")),
})).min(1).max(200);

// ---------- 2단계 수량 확정 ----------
/** 확정 수량은 확보 수량 이내(부분 확보 시), 0 이상 (기획서 §4 "확보 수량 안에서") */
export function qtyOverConfirmed(lines: { id: string; qty: number; confirmed_qty: number | null; expected_qty: number }[]) {
  return lines.filter((l) => l.qty > (l.confirmed_qty ?? l.expected_qty)).map((l) => l.id);
}

// ---------- 금액 ----------
export type InvoiceGroup = { offerId: string; price_tiers: PriceTier[]; fee_rate: number; lines: { lineId: string; qty: number }[] };
export type InvoiceInput = {
  groups: InvoiceGroup[];
  options?: { offerId: string; label: string; qty: number; unit_price_krw: number }[]; // offers.option_prices(KRW) 기준, 수수료 미적용
  keptSamples?: { offerId: string; charged_krw: number; already_deducted: boolean }[]; // 미회수 청구분 — 같은 상품 발주 시 1회 차감
  deposit_paid_krw?: number;
  credit_krw?: number;
  logistics_final_krw?: number | null;
};
/**
 * 청구 내역(invoice_snapshot) — 제안(상품)별 tier는 그 제안의 총수량으로 고른다. 수수료는 상품가 소계 × fee_rate(제안에 고정된 값).
 * 라인 단가(unit_price_krw)는 공급가(상품가 + 수수료)로 고정해 검수 보고·크레딧 계산에 쓴다.
 */
export function orderInvoice(inp: InvoiceInput) {
  const groups = inp.groups.map((g) => {
    const qty = g.lines.reduce((s, l) => s + l.qty, 0);
    const tier = qty > 0 ? pickTier(g.price_tiers, qty) : [...g.price_tiers].sort((a, b) => a.min_qty - b.min_qty)[0];
    const subtotal = qty * tier.product_price_krw;
    const fee = ceil10(subtotal * g.fee_rate);
    return { offerId: g.offerId, qty, tier_min_qty: tier.min_qty, product_price_krw: tier.product_price_krw, unit_supply_krw: supplyPriceKrw(tier.product_price_krw, g.fee_rate), subtotal_krw: subtotal, fee_krw: fee };
  });
  const offerIds = new Set(groups.filter((g) => g.qty > 0).map((g) => g.offerId));
  const subtotal = groups.reduce((s, g) => s + g.subtotal_krw, 0);
  const fee = groups.reduce((s, g) => s + g.fee_krw, 0);
  const options = (inp.options ?? []).reduce((s, o) => s + o.qty * o.unit_price_krw, 0);
  const sample_deduction = (inp.keptSamples ?? []).filter((k) => !k.already_deducted && offerIds.has(k.offerId)).reduce((s, k) => s + k.charged_krw, 0);
  const deposit = inp.deposit_paid_krw ?? 0;
  const credit = inp.credit_krw ?? 0;
  const logistics = inp.logistics_final_krw ?? 0;
  return {
    groups, subtotal_krw: subtotal, fee_krw: fee, options_krw: options, sample_deduction_krw: sample_deduction, deposit_paid_krw: deposit,
    credit_krw: credit, logistics_final_krw: inp.logistics_final_krw ?? null,
    total_krw: subtotal + fee + options - sample_deduction - deposit - credit + logistics,
  };
}

/** 선금 = (예상 수량 기준 소계 + 수수료) × 선금율 — 확정 수량으로 정산(최종 청구에서 차감) */
export function orderDeposit(groups: InvoiceGroup[], pct: number) {
  const inv = orderInvoice({ groups });
  return depositKrw(inv.subtotal_krw, inv.fee_krw, pct);
}

// ---------- 검품·검수 보고 ----------
/** 정보 일치율(KPI, D2): 검품 결과 중 일치 항목 비율 % (소수 1자리). 결과 없으면 null */
export function infoMatchRate(results: { match: boolean }[]) {
  if (!results.length) return null;
  return Math.round((results.filter((r) => r.match).length / results.length) * 1000) / 10;
}
/** 불량 크레딧 = Σ 불량 수량 × 라인 공급가 단가 (관리자 조정 가능 — 감사 로그) */
export const creditAmount = (lines: { defect_qty: number; unit_price_krw: number | null }[]) => lines.reduce((s, l) => s + l.defect_qty * (l.unit_price_krw ?? 0), 0);
