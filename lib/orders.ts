import { CARE, MATERIALS, ORIGINS, label as codeLabel } from "@/lib/codes";
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
  waiveSampleGate: z.boolean().default(false), // 관리자 대행 전용 (서버가 onBehalf 아니면 거부)
  modRequests: z.array(z.object({ offerId: z.guid(), item: z.string().max(20), note: z.string().trim().max(200).optional().or(z.literal("")) })).max(20).default([]),
}).refine((v) => v.gbOpen < v.gbClose, { message: "order.error.dates", path: ["gbClose"] })
  .refine((v) => v.holdChoice === "deposit" || v.holdAck, { message: "order.error.holdAck", path: ["holdAck"] });
export type ReserveInput = z.infer<typeof ReserveInput>;

/** 담기 판정 (절대 규칙 7): 제안 관심 AND 같은 상품(brand, product)의 샘플 피드백 관심. 예외 리오더·관리자 면제(제안 관심일 때만) */
export function orderEligible(o: { status: string; sampleFeedbacks: (string | null)[]; hasReorder: boolean; adminWaived?: boolean }) {
  return canAddToOrder({
    offer_reaction: o.status,
    sample_feedback: o.sampleFeedbacks.includes("interested") ? "interested" : (o.sampleFeedbacks.find(Boolean) as "hold" | "declined" | undefined) ?? null,
    has_reorder_history: o.hasReorder,
    admin_waived: !!o.adminWaived,
  });
}

/** 같은 상품의 샘플 피드백 모으기 — 제안 id가 아니라 상품으로 잇는다(만료 → 재발행돼도 유지, DECISIONS r5-4). rows는 이미 brand로 걸러진 것 */
export function feedbacksForProduct(rows: { product_id: string | null | undefined; feedback: string | null }[], productId: string) {
  return rows.filter((r) => r.product_id === productId).map((r) => r.feedback);
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
  keptSamples?: { offerId: string; charged_krw: number; already_deducted: boolean; sampleItemId?: string }[]; // 미회수 청구분 — 같은 상품 발주 시 1회 차감
  deposit_paid_krw?: number;
  credit_krw?: number;
  logistics_final_krw?: number | null;
  /** 실적 브랜드의 후청구 샘플 물류비 (요청서별 1회, DECISIONS r4 #3) */
  sample_logistics?: { sampleRequestId: string; krw: number }[];
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
    // unit_effective_krw: 라인에 고정하는 실효 단가 = (소계 + 수수료) / 수량 내림 — 크레딧(불량 × 단가)이 청구액을 넘지 않게 (7단계 리뷰 9)
    return {
      offerId: g.offerId, qty, tier_min_qty: tier.min_qty, product_price_krw: tier.product_price_krw, unit_supply_krw: supplyPriceKrw(tier.product_price_krw, g.fee_rate),
      unit_effective_krw: qty > 0 ? Math.floor((subtotal + fee) / qty) : 0, subtotal_krw: subtotal, fee_krw: fee,
    };
  });
  const offerIds = new Set(groups.filter((g) => g.qty > 0).map((g) => g.offerId));
  const subtotal = groups.reduce((s, g) => s + g.subtotal_krw, 0);
  const fee = groups.reduce((s, g) => s + g.fee_krw, 0);
  const options = (inp.options ?? []).reduce((s, o) => s + o.qty * o.unit_price_krw, 0);
  // 차감은 수량이 남은 제안의 샘플만 — 실제로 차감한 항목 id를 돌려줘 그 항목만 deducted로 바꾼다 (7단계 리뷰 2)
  const deductedKept = (inp.keptSamples ?? []).filter((k) => !k.already_deducted && offerIds.has(k.offerId));
  const sample_deduction = deductedKept.reduce((s, k) => s + k.charged_krw, 0);
  const deposit = inp.deposit_paid_krw ?? 0;
  const credit = inp.credit_krw ?? 0;
  const logistics = inp.logistics_final_krw ?? 0;
  const sample_logistics = (inp.sample_logistics ?? []).reduce((s, x) => s + x.krw, 0);
  const raw = subtotal + fee + options - sample_deduction - deposit - credit + logistics + sample_logistics;
  return {
    groups, subtotal_krw: subtotal, fee_krw: fee, options_krw: options, sample_deduction_krw: sample_deduction, deposit_paid_krw: deposit,
    credit_krw: credit, logistics_final_krw: inp.logistics_final_krw ?? null,
    sample_logistics_krw: sample_logistics, sample_logistics_requests: (inp.sample_logistics ?? []).map((x) => x.sampleRequestId),
    deducted_sample_ids: deductedKept.flatMap((k) => (k.sampleItemId ? [k.sampleItemId] : [])),
    // 선금·차감이 청구액을 넘으면(수량을 크게 줄인 경우) 총 청구는 0, 초과분은 환불 예정으로 따로 — 음수 청구서를 만들지 않는다 (r5 리뷰 5). 환불은 플랫폼 밖(절대 규칙 13)
    total_krw: Math.max(0, raw),
    refund_due_krw: Math.max(0, -raw),
  };
}

/**
 * 옵션 청구 라인 (발주 확정·미리보기 공용): 라벨·행택은 선택 수량 × 단가, 디테일 수정은 그 제안의 총수량 × 개당 가격.
 * 가격은 제안 발행 때 고정된 option_prices(KRW)만 쓴다(절대 규칙 3·5). 제안에 없는 옵션은 버린다.
 */
export function orderOptionLines(args: {
  optionPrices: { offerId: string; option_prices: unknown }[];
  labels: { offerId: string; type: string; qty: number }[];
  mods: { offerId: string; item: string }[];
  qtyByOffer: Map<string, number>;
}) {
  const op = (id: string) => (args.optionPrices.find((o) => o.offerId === id)?.option_prices ?? null) as { labels?: { type: string; unit_price_krw: number }[]; mods?: { item: string; price_krw: number }[] } | null;
  const labels = args.labels.flatMap((lb) => {
    const x = op(lb.offerId)?.labels?.find((l) => l.type === lb.type);
    return x && lb.qty > 0 ? [{ offerId: lb.offerId, label: `label:${lb.type}`, qty: lb.qty, unit_price_krw: x.unit_price_krw }] : [];
  });
  const mods = args.mods.flatMap((m) => {
    const x = op(m.offerId)?.mods?.find((d) => d.item === m.item);
    const qty = args.qtyByOffer.get(m.offerId) ?? 0;
    return x && qty > 0 ? [{ offerId: m.offerId, label: `mod:${m.item}`, qty, unit_price_krw: x.price_krw }] : [];
  });
  return [...labels, ...mods];
}

/** 선금 = (예상 수량 기준 소계 + 수수료) × 선금율 — 확정 수량으로 정산(최종 청구에서 차감) */
export function orderDeposit(groups: InvoiceGroup[], pct: number) {
  const inv = orderInvoice({ groups });
  return depositKrw(inv.subtotal_krw, inv.fee_krw, pct);
}

// ---------- 검품·검수 보고 ----------
/**
 * 본품 검품 기준서 (CLAUDE.md 용어 "기준서 = 상품 정보 필드 1:1"): 브랜드가 본 상품 정보 그대로를 기대값으로 한다.
 * 결과의 field 키는 이 목록과 같다 — 정보 일치율이 필드 단위로 집계된다.
 */
/** 검품 기준(본품). 기대값은 브랜드 리포트로 나가므로 코드가 아니라 한국어 이름으로 (버튼 점검 11-10: "cotton 100%"·"CN"·"machine_30"이 그대로 보이던 문제) */
export function bulkCriteria(p: { fabric: { material_code: string; pct: number }[] | null; origin: string | null; care_codes: string[] | null }, colors: string[], sizes: string[]) {
  return [
    { field: "fabric", expected: (p.fabric ?? []).map((f) => `${codeLabel(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(" · ") },
    { field: "origin", expected: p.origin ? codeLabel(ORIGINS, p.origin, "ko") : "" },
    { field: "care", expected: (p.care_codes ?? []).map((c) => codeLabel(CARE, c, "ko")).join(", ") },
    { field: "colors", expected: colors.join(", ") },
    { field: "sizes", expected: sizes.join(", ") },
  ];
}

/** 정보 일치율(KPI, D2): 검품 결과 중 일치 항목 비율 % (소수 1자리). 결과 없으면 null */
export function infoMatchRate(results: { match: boolean }[]) {
  if (!results.length) return null;
  return Math.round((results.filter((r) => r.match).length / results.length) * 1000) / 10;
}
/** 불량 크레딧 = Σ 불량 수량 × 라인 공급가 단가 (관리자 조정 가능 — 감사 로그) */
export const creditAmount = (lines: { defect_qty: number; unit_price_krw: number | null }[]) => lines.reduce((s, l) => s + l.defect_qty * (l.unit_price_krw ?? 0), 0);

/**
 * 최종 견적 브랜드 동의 판정 (DECISIONS u-10). 동의 = 감사 로그 `order.final_approve`(총액·시각).
 * 확정은 "지금 최종 견적(final_quoted_at) 이후의 동의"이고 "동의한 총액 = 지금 계산 총액"일 때만.
 */
export type FinalApproval = { at: string; total_krw: number; onBehalf: boolean };
export function finalApprovalState(approval: FinalApproval | null, finalQuotedAt: string | null, currentTotal: number): "ok" | "missing" | "stale" | "changed" {
  if (!approval) return "missing";
  if (finalQuotedAt && new Date(approval.at).getTime() < new Date(finalQuotedAt).getTime()) return "stale";
  if (approval.total_krw !== currentTotal) return "changed";
  return "ok";
}
