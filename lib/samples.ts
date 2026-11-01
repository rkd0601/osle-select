/**
 * 샘플 순수 로직 (B-06·B-07·A-05, PRD D13·4·7장, COWORK_DECISIONS r3 STEP6).
 * 회수 원칙: 물류비(특송 Σ + 국내 배송 1회)는 항상, 상품가는 회수 기한 안에 반납하지 않으면 청구 → 발주 시 1회 차감.
 * 결제 자동화 없음 — 입금은 신고·확인 플래그뿐 (절대 규칙 13).
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
    agreeReturn: z.literal(true),
  });
}

/** 결제 게이트: 신규 등급은 입금 확인 후 출고, 실적 등급은 바로 출고 준비(후불) */
export const initialSampleStatus = (tier: "new" | "proven") => (tier === "new" ? "awaiting_payment" : "requested");

export type SampleCostLine = { qty: number; weight_g: number; product_price_krw: number };
/** 요청 시점 고정 금액 — 물류비(한 금액)와 미회수 시 상품가 합 */
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
export const feedbackComplete = (items: { feedback: string | null }[]) => items.length > 0 && items.every((i) => !!i.feedback);

/** 회수 기한 경과(관리자 큐 "기한 경과" 섹션). 반납 신청·청구된 건은 제외 */
export function returnOverdue(item: { return_status: string; charge_status: string; return_requested_at: string | null }, return_due: string | null, now: Date) {
  return !!return_due && item.return_status !== "returned" && item.charge_status === "none" && !item.return_requested_at && return_due < kst(now);
}
/** 미회수 청구액 = 수량 × 요청 시점 고정 상품가 */
export const chargeAmount = (item: { qty: number; product_price_krw: number | null }) => item.qty * (item.product_price_krw ?? 0);

/** 요청서를 닫을 수 있는가: 모든 항목이 반납 완료 또는 청구 확정 */
export const allResolved = (items: { return_status: string; charge_status: string }[]) =>
  items.length > 0 && items.every((i) => i.return_status === "returned" || i.charge_status === "charged" || i.charge_status === "deducted");

/** 검품 불량 템플릿 코드 (zh/ko 고정 문구 i18n sample.defect.<code>, CLAUDE.md 규칙 10) */
export const SAMPLE_DEFECTS = ["stain", "seam", "color_mismatch", "size_mismatch", "fabric_mismatch", "damage", "missing_part", "other"] as const;
