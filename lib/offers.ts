/**
 * 제안(offer) 순수 로직 — "제안 = offer 1행"(CLAUDE.md 절대 규칙 3, PRD D8·D15·D16).
 * 첫 제안·재제안·추천이 같은 발행 액션을 쓴다. 상품은 복사하지 않는다.
 */
import { buildPriceTiers, optionPricesKrw, resolveRates, sampleLogisticsFeeKrw, type CostTier, type LabelOptionCost, type ModOptionCost, type OptionPrices, type PriceTier } from "./pricing";

export type OfferType = "request" | "reoffer" | "recommend";
/** 브랜드 반응 대기·진행 중인 상태 (독점·중복 판정 대상) */
export const LIVE_OFFER = ["new", "interested", "hold", "recheck", "reconsent_pending"] as const;
export const isLive = (s: string) => (LIVE_OFFER as readonly string[]).includes(s);

/** 유형: 요청 항목이 없으면 추천(비독점), **같은 브랜드**에 이 상품을 이미 제안한 적 있으면 재제안, 아니면 첫 제안 (다른 브랜드의 이력은 세지 않는다 — r3 리뷰 10) */
export function offerType(requestItemId: string | null | undefined, priorOfferCountForBrand: number): OfferType {
  if (!requestItemId) return "recommend";
  return priorOfferCountForBrand > 0 ? "reoffer" : "request";
}

/** 날짜(YYYY-MM-DD)는 한국 기준으로 센다 — 독점·유효기간은 "KST 그날 23:59:59"까지이므로 UTC 날짜를 쓰면 새벽 발행 시 하루 짧아진다 (r3 리뷰 9) */
export const kstDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
const day = kstDay;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** 독점 종료일·유효기간(date). 추천은 비독점(null) */
export function offerDates(type: OfferType, now: Date, s: { exclusive_days: number; offer_valid_days: number }) {
  return { exclusive_until: type === "recommend" ? null : day(addDays(now, s.exclusive_days)), valid_until: day(addDays(now, s.offer_valid_days)) };
}

/**
 * 발행 차단 사유 (D15): 다른 브랜드의 독점 기간이 살아 있는 제안이 있으면 재제안 불가. 같은 브랜드·같은 항목의 살아 있는 제안이 있으면 중복.
 * 반환: null(발행 가능) 또는 i18n 키
 */
export function issueBlocker(
  existing: { brand_id: string; request_item_id: string | null; status: string; exclusive_until: string | null }[],
  target: { brandId: string; requestItemId: string | null },
  today: Date,
): string | null {
  const t = day(today);
  if (existing.some((o) => o.brand_id === target.brandId && (o.request_item_id ?? null) === (target.requestItemId ?? null) && isLive(o.status))) return "offer.error.duplicate";
  if (existing.some((o) => o.brand_id !== target.brandId && isLive(o.status) && o.exclusive_until && o.exclusive_until >= t)) return "offer.error.exclusive";
  return null;
}

/** 재확인 후 재승인 시 제안 상태 (PRD 4장): 가격 tier가 같으면 이전 반응 복원, 다르면 브랜드 재동의 대기 */
export function statusAfterReapproval(
  offer: { status_before_recheck: string | null; price_tiers: PriceTier[]; fee_rate?: number },
  newTiers: PriceTier[],
  newFeeRate?: number,
): "new" | "interested" | "hold" | "reconsent_pending" {
  // "가격 같음" = price_tiers 전체 + fee_rate 동일 (COWORK_DECISIONS STEP5 #3). 재동의는 반응 복원이 아니라 새 반응
  const sameTiers = JSON.stringify(offer.price_tiers.map((x) => [x.min_qty, x.product_price_krw])) === JSON.stringify(newTiers.map((x) => [x.min_qty, x.product_price_krw]));
  const sameFee = newFeeRate === undefined || offer.fee_rate === undefined || Number(offer.fee_rate) === Number(newFeeRate);
  const same = sameTiers && sameFee;
  if (!same) return "reconsent_pending";
  const prev = offer.status_before_recheck;
  return prev === "interested" || prev === "hold" ? prev : prev === "reconsent_pending" ? "reconsent_pending" : "new";
}

/** 독점 D-day (브랜드 표시). 지났으면 0, 비독점이면 null */
export function exclusiveDday(exclusive_until: string | null, today: Date): number | null {
  if (!exclusive_until) return null;
  const diff = Math.ceil((new Date(`${exclusive_until}T23:59:59+09:00`).getTime() - today.getTime()) / 86400000);
  return Math.max(0, diff);
}


/**
 * 발행·재가격 시 offers 1행에 고정할 값 한 곳 (A-04 발행, A-03 재승인 공통). 순수 함수.
 * 샘플 물류비는 1벌 기준 금액만(중량 비노출), 미회수 샘플 상품가는 최소 tier 상품가.
 */
export function computeOfferFixed(args: {
  costTiers: CostTier[];
  weightG: number;
  labels: LabelOptionCost[];
  mods: ModOptionCost[];
  brand: { fee_rate: number | null; hidden_margin_rate: number | null };
  settings: { fee_rate: number; hidden_margin_rate: number; fx_rate_cny_krw: number; sample_air_per_kg_krw: number; domestic_shipping_krw: number };
}): { price_tiers: PriceTier[]; fee_rate: number; hidden_margin_rate: number; fx_rate: number; sample_fee_product_krw: number; sample_logistics_krw: number; option_prices: OptionPrices } {
  const ctx = resolveRates(args.brand, args.settings);
  const price_tiers = buildPriceTiers(args.costTiers, ctx);
  return {
    price_tiers,
    fee_rate: ctx.fee_rate,
    hidden_margin_rate: ctx.hidden_margin_rate,
    fx_rate: ctx.fx_rate,
    sample_fee_product_krw: price_tiers[0].product_price_krw,
    sample_logistics_krw: sampleLogisticsFeeKrw([{ weight_g: args.weightG, qty: 1, product_price_krw: price_tiers[0].product_price_krw }], args.settings.sample_air_per_kg_krw, args.settings.domestic_shipping_krw),
    option_prices: optionPricesKrw(args.labels, args.mods, ctx),
  };
}
