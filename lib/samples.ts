/**
 * 샘플 순수 로직 (B-06·B-07·A-05, PRD D13·4·7장, COWORK_DECISIONS r3 STEP6).
 * v2 (d-26·d-27, NEXT §0-l S1~S4): 샘플은 **무료** — 물류비(특송 Σ + 국내 배송 1회)만 **후불**로 다음 청구에 합산(입금 대기 없음, 요청 즉시 출고 준비).
 * 받은 뒤 돌려보내기 / 구매(구매가 = 공급가 + 소량 비율) 둘 중 하나. 기한(피드백 + 회수) 지나면 자동 구매. 구매분은 같은 상품 발주 시 1회 차감.
 * DB 값은 그대로 쓴다: return_status kept = 구매, charge_status charged = 구매 청구 확정. 결제 자동화 없음 (절대 규칙 13).
 */
import { z } from "zod";
import { sampleLogisticsFeeKrw, sampleProductFeeKrw } from "./pricing";

/** 샘플 요청서에 담을 수 있는 제안 상태: 관심. 보류는 담는 순간 관심으로 전이(같은 액션). 새 제안·재동의·재확인·만료 불가 */
export const SAMPLE_OFFER_OK = ["interested", "hold"] as const;
export const canAddToSample = (offerStatus: string) => (SAMPLE_OFFER_OK as readonly string[]).includes(offerStatus);
export const needsInterestFirst = (offerStatus: string) => offerStatus === "hold";

export const ShipTo = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(5).max(30),
  address: z.string().trim().min(5).max(200),
  memo: z.string().trim().max(100).optional().or(z.literal("")),
});
export type ShipTo = z.infer<typeof ShipTo>;

/** B-06 입력. variant별 수량 0~max(0은 제외), 합 ≥1, 같은 variant 중복 불가, 회수 원칙 동의 필수 */
export function sampleRequestSchema(qtyMax: number) {
  return z.object({
    lines: z
      .array(z.object({ offerId: z.guid(), variantId: z.guid(), qty: z.number().int().min(0).max(qtyMax) }))
      .min(1)
      .max(60)
      .refine((ls) => ls.reduce((s, l) => s + l.qty, 0) >= 1, { message: "sample.error.empty" })
      .refine((ls) => new Set(ls.map((l) => l.variantId)).size === ls.length, { message: "common.invalid" }),
    shipTo: ShipTo,
    /** 받는 곳을 브랜드 기본 배송지(brands.default_address, 설정과 같은 곳)로 저장할지. 생략 = 저장(기존 동작), false = 저장 안 함 (7차 W3) */
    saveDefault: z.boolean().optional(),
    agreeReturn: z.literal(true),
  });
}

/** v2(d-26): 입금 게이트 없음 — 등급(new·proven)과 관계없이 바로 출고 준비(requested), 물류비는 후불. 인자는 예전 호출부 호환으로 받기만 한다 */
export function initialSampleStatus(...args: ["new" | "proven"] | []): "requested" {
  void args;
  return "requested";
}

export type SampleCostLine = { qty: number; weight_g: number; product_price_krw: number };
/** 요청 시점 고정 금액 — 물류비(한 금액, 후불)와 구매하면 더해질 구매가 합 */
export function sampleAmounts(lines: SampleCostLine[], s: { sample_air_per_kg_krw: number; domestic_shipping_krw: number }) {
  const ls = lines.filter((l) => l.qty > 0);
  return {
    logistics_fee_krw: sampleLogisticsFeeKrw(ls, s.sample_air_per_kg_krw, s.domestic_shipping_krw),
    product_fee_total_krw: sampleProductFeeKrw(ls),
  };
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const kst = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
/** 도착(delivered) 시 피드백 기한, 피드백 완료(feedback_done) 시 회수 기한 — KST 날짜 */
export const feedbackDue = (now: Date, days: number) => kst(addDays(now, days));
export const returnDue = (now: Date, days: number) => kst(addDays(now, days));

/** 모든 항목에 피드백이 있으면 요청서는 feedback_done으로 */
/** 출고 불가(unavailable)로 검품된 항목은 브랜드가 받지 않았으므로 피드백·회수·청구 대상이 아니다 (6단계 리뷰 4) */
export const isDelivered = (i: { status?: string }) => i.status !== "unavailable";
export const feedbackComplete = (items: { feedback: string | null; status?: string }[]) => {
  const got = items.filter(isDelivered);
  return got.length > 0 && got.every((i) => !!i.feedback);
};

/** 회수 기한 경과(관리자 큐 "기한 경과" 섹션). 반납 신청·청구된 건은 제외 */
export function returnOverdue(item: { return_status: string; charge_status: string; return_requested_at: string | null; status?: string }, return_due: string | null, now: Date) {
  return isDelivered(item) && !!return_due && item.return_status !== "returned" && item.charge_status === "none" && !item.return_requested_at && return_due < kst(now);
}
/** 구매 청구액 = 수량 × 요청 시점 고정 구매가 */
export const chargeAmount = (item: { qty: number; product_price_krw: number | null }) => item.qty * (item.product_price_krw ?? 0);

/** 요청서를 닫을 수 있는가: 모든 항목이 반납 완료 또는 청구 확정 */
export const allResolved = (items: { return_status: string; charge_status: string; status?: string }[]) =>
  items.length > 0 && items.filter(isDelivered).every((i) => i.return_status === "returned" || i.charge_status === "charged" || i.charge_status === "deducted");
/** 피드백 기한이 지났는데 피드백이 끝나지 않았으면 관리자가 피드백 단계를 닫고 회수 기한을 시작할 수 있다 (6단계 리뷰 3) */
export const feedbackOverdue = (feedback_due: string | null, now: Date) => !!feedback_due && feedback_due < kst(now);

/**
 * 청구 예정에 들어갈 샘플 금액 (S6, 홈·청구 같은 기준): 물류비 = 후불이면 아직 발주 청구에 붙지 않은 것(logistics_billed_order_id 없음),
 * 0058 전 선불 행이면 입금 확인 전. 구매 = 청구 확정(charged)된 구매가 + 브랜드가 구매를 골랐고 아직 확정 전(kept·none)인 구매가.
 */
export function sampleBillingDue(
  r: { status: string; payment_required: boolean; payment_confirmed_at: string | null; logistics_fee_krw: number | null; logistics_billed_order_id?: string | null },
  items: { qty: number; return_status?: string | null; charge_status: string; charged_krw: number; product_price_krw?: number | null }[],
): { logistics: number; purchase: number } {
  if (r.status === "cancelled") return { logistics: 0, purchase: 0 };
  const fee = r.logistics_fee_krw ?? 0;
  const logistics = r.payment_required ? (r.payment_confirmed_at ? 0 : fee) : r.logistics_billed_order_id ? 0 : fee;
  const purchase = items.reduce((s, i) =>
    s + (i.charge_status === "charged" ? i.charged_krw : i.charge_status === "none" && i.return_status === "kept" ? i.qty * (i.product_price_krw ?? 0) : 0), 0);
  return { logistics, purchase };
}

/** 자동 구매(S4): 회수 기한이 지났는데 반납도 반납 신청도 구매 선택도 없는 항목 — 크론이 kept로 */
export const autoPurchaseDue = returnOverdue;
/** 자동 구매 3일 전 알림(S4): 회수 기한까지 남은 날(KST)이 0~3이고 아직 결정 전인 항목 */
export function purchaseReminderDue(item: { return_status: string; charge_status: string; return_requested_at: string | null; status?: string }, return_due: string | null, now: Date, days = 3) {
  if (!isDelivered(item) || !return_due || item.return_status !== "due" || item.charge_status !== "none" || item.return_requested_at) return false;
  const today = kst(now);
  return return_due >= today && return_due <= kst(addDays(now, days));
}
/** 받은 뒤 결정 상태(관리자 S7 "결정" 열·브랜드 문장): 돌려보냄 · 반납 신청 · 구매 · 대기 */
export function sampleDecision(item: { return_status: string; charge_status: string; return_requested_at: string | null }): "returned" | "return_requested" | "purchased" | "pending" {
  if (item.return_status === "returned") return "returned";
  if (item.return_status === "kept" || item.charge_status !== "none") return "purchased";
  if (item.return_requested_at) return "return_requested";
  return "pending";
}

/** 검품 불량 템플릿 코드 (zh/ko 고정 문구 i18n sample.defect.<code>, CLAUDE.md 규칙 10) */
export const SAMPLE_DEFECTS = ["stain", "seam", "color_mismatch", "size_mismatch", "fabric_mismatch", "damage", "missing_part", "other"] as const;
