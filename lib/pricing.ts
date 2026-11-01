/**
 * 가격·비용 계산 순수 함수. PRD 7장.
 * 화면은 표시용으로만 호출하고, 발행·확정 시점에 결과를 DB에 고정 저장한다.
 * 원가(CNY)·환율·녹인 마진은 이 모듈 밖(브랜드 응답)으로 나가면 안 된다.
 */

export type CostTier = { min_qty: number; cost_cny: number };
export type PriceTier = { min_qty: number; product_price_krw: number };

export type PricingContext = {
  fx_rate: number; // CNY → KRW
  hidden_margin_rate: number; // 0.20, 브랜드 비노출
  fee_rate: number; // 0.20, "소싱 서비스 수수료"로 노출
};

/** 10원 단위 올림 */
export const ceil10 = (krw: number): number => Math.ceil(krw / 10) * 10;

/** 상품가(KRW) = 원가 × 환율 × (1 + 녹인 마진). 브랜드에게 "상품가"로 보인다. */
export function productPriceKrw(cost_cny: number, ctx: PricingContext): number {
  if (cost_cny < 0) throw new Error("cost_cny must be >= 0");
  return ceil10(cost_cny * ctx.fx_rate * (1 + ctx.hidden_margin_rate));
}

/** 공급가(KRW) = 상품가 × (1 + 수수료). 화면 메인 숫자. */
export function supplyPriceKrw(product_price_krw: number, fee_rate: number): number {
  return ceil10(product_price_krw * (1 + fee_rate));
}

/** 원가 tier → 브랜드 노출용 가격 tier (offer.price_tiers에 고정 저장) */
export function buildPriceTiers(cost_tiers: CostTier[], ctx: PricingContext): PriceTier[] {
  if (!cost_tiers.length) throw new Error("at least one cost tier required");
  const sorted = [...cost_tiers].sort((a, b) => a.min_qty - b.min_qty);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].cost_cny > sorted[i - 1].cost_cny) {
      throw new Error("cost tiers must be non-increasing by quantity");
    }
  }
  return sorted.map((t) => ({ min_qty: t.min_qty, product_price_krw: productPriceKrw(t.cost_cny, ctx) }));
}

/** 발주 총수량으로 적용 tier 선택. 최소 tier 미만이면 최소 tier. */
export function pickTier(tiers: PriceTier[], total_qty: number): PriceTier {
  if (!tiers.length) throw new Error("no tiers");
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  let chosen = sorted[0];
  for (const t of sorted) if (total_qty >= t.min_qty) chosen = t;
  return chosen;
}

export type SampleLine = { weight_g: number; qty: number; product_price_krw: number };

/** 샘플 물류비 = Σ qty × (중량/1000) × kg당 특송 + 국내 배송. 브랜드에게 한 금액으로만 노출. */
export function sampleLogisticsFeeKrw(
  lines: SampleLine[],
  sample_air_per_kg_krw: number,
  domestic_shipping_krw: number,
): number {
  const air = lines.reduce((s, l) => s + l.qty * (l.weight_g / 1000) * sample_air_per_kg_krw, 0);
  return ceil10(air) + domestic_shipping_krw;
}

/** 미회수 시 청구될 샘플 상품가 합 */
export function sampleProductFeeKrw(lines: SampleLine[]): number {
  return lines.reduce((s, l) => s + l.qty * l.product_price_krw, 0);
}

export type OrderLineInput = { variant_id: string; qty: number };
export type OptionFee = { label: string; qty_basis: number; unit_cost_cny: number };
export type KeptSample = { product_price_krw: number; qty: number; already_deducted: boolean };

export type OrderTotals = {
  total_qty: number;
  applied_tier: PriceTier;
  subtotal_krw: number;
  fee_krw: number;
  options_krw: number;
  sample_deduction_krw: number;
  deposit_paid_krw: number;
  credit_krw: number;
  logistics_final_krw: number | null;
  total_krw: number;
};

/** 발주 금액. 옵션(라벨·수정)은 원가×환율×(1+녹인 마진)로 계산하고 수수료는 붙이지 않는다. */
export function orderTotals(args: {
  lines: OrderLineInput[];
  price_tiers: PriceTier[];
  fee_rate: number;
  options?: OptionFee[];
  option_ctx?: PricingContext;
  kept_samples?: KeptSample[];
  deposit_paid_krw?: number;
  credit_krw?: number;
  logistics_final_krw?: number | null;
}): OrderTotals {
  const total_qty = args.lines.reduce((s, l) => s + l.qty, 0);
  if (total_qty <= 0) throw new Error("order needs qty > 0");
  const applied_tier = pickTier(args.price_tiers, total_qty);
  const subtotal_krw = total_qty * applied_tier.product_price_krw;
  const fee_krw = ceil10(subtotal_krw * args.fee_rate);
  const options_krw = (args.options ?? []).reduce((s, o) => {
    if (!args.option_ctx) throw new Error("option_ctx required when options present");
    return s + o.qty_basis * productPriceKrw(o.unit_cost_cny, args.option_ctx);
  }, 0);
  // 같은 상품의 미회수(보유)·청구된 샘플 상품가를 한 번만 차감
  const sample_deduction_krw = (args.kept_samples ?? [])
    .filter((k) => !k.already_deducted)
    .reduce((s, k) => s + k.qty * k.product_price_krw, 0);
  const deposit_paid_krw = args.deposit_paid_krw ?? 0;
  const credit_krw = args.credit_krw ?? 0;
  const logistics_final_krw = args.logistics_final_krw ?? null;
  const total_krw =
    subtotal_krw + fee_krw + options_krw - sample_deduction_krw - deposit_paid_krw - credit_krw + (logistics_final_krw ?? 0);
  return {
    total_qty,
    applied_tier,
    subtotal_krw,
    fee_krw,
    options_krw,
    sample_deduction_krw,
    deposit_paid_krw,
    credit_krw,
    logistics_final_krw,
    total_krw,
  };
}

/** 선금 = (소계 + 수수료) × 선금율. 예상 수량 기준으로 계산하고 확정 수량으로 정산. */
export function depositKrw(subtotal_krw: number, fee_krw: number, deposit_pct: number): number {
  if (deposit_pct < 0 || deposit_pct > 1) throw new Error("deposit_pct 0..1");
  return ceil10((subtotal_krw + fee_krw) * deposit_pct);
}

/** 물류·통관 범위 견적 초안. 관리자가 조정한다. */
export function logisticsEstimateKrw(args: {
  qty_min: number;
  qty_max: number;
  weight_g: number;
  per_kg_krw: number;
  customs_rate: number;
  goods_value_krw_per_unit: number;
}): { min_krw: number; max_krw: number } {
  const calc = (q: number) =>
    ceil10((q * args.weight_g) / 1000 * args.per_kg_krw + q * args.goods_value_krw_per_unit * args.customs_rate);
  return { min_krw: calc(args.qty_min), max_krw: calc(args.qty_max) };
}

/** 환율 변동 재확인 필요 여부 (PRD D16) */
export function fxNeedsRecheck(fx_at_issue: number, fx_now: number, pct: number): boolean {
  return Math.abs(fx_now - fx_at_issue) / fx_at_issue >= pct;
}

/**
 * 브랜드 희망 단가(공급가, 수수료 포함 KRW) → CN 소싱 목표 원가(CNY). productPrice·supplyPrice의 역산.
 * CN_SOURCER 화면 전용(PRD 2장). 브랜드·CN_VENDOR 응답에는 싣지 않는다. 0.1위안 단위 내림.
 */
export function targetCostCny(target_supply_krw: number, ctx: PricingContext): number {
  if (target_supply_krw <= 0) return 0;
  const cost = target_supply_krw / (1 + ctx.fee_rate) / (1 + ctx.hidden_margin_rate) / ctx.fx_rate;
  return Math.floor(cost * 10) / 10;
}
