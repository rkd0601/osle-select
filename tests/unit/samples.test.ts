import { describe, it, expect } from "vitest";
import {
  allResolved, canAddToSample, chargeAmount, feedbackComplete, feedbackDue, initialSampleStatus, needsInterestFirst, returnOverdue, sampleAmounts, sampleRequestSchema,
} from "@/lib/samples";
import { canTransition } from "@/lib/transitions";
import { ownerAndDue } from "@/lib/sla";

const O = "70000000-0000-0000-0000-000000000001";
const V1 = "80000000-0000-0000-0000-000000000001";
const V2 = "80000000-0000-0000-0000-000000000002";
const ship = { name: "김대표", phone: "010-1234-5678", address: "서울시 성동구 성수이로 1" };

describe("B-06 요청서 입력 (DECISIONS r3 STEP6)", () => {
  const S = sampleRequestSchema(3);
  it("variant별 0~3, 합 ≥1, 같은 variant 중복 불가, 회수 동의 필수", () => {
    expect(S.safeParse({ lines: [{ offerId: O, variantId: V1, qty: 1 }, { offerId: O, variantId: V2, qty: 0 }], shipTo: ship, agreeReturn: true }).success).toBe(true);
    expect(S.safeParse({ lines: [{ offerId: O, variantId: V1, qty: 0 }], shipTo: ship, agreeReturn: true }).error?.issues[0].message).toBe("sample.error.empty");
    expect(S.safeParse({ lines: [{ offerId: O, variantId: V1, qty: 4 }], shipTo: ship, agreeReturn: true }).success).toBe(false);
    expect(S.safeParse({ lines: [{ offerId: O, variantId: V1, qty: 1 }], shipTo: ship, agreeReturn: false }).success).toBe(false);
    expect(S.safeParse({ lines: [{ offerId: O, variantId: V1, qty: 1 }, { offerId: O, variantId: V1, qty: 1 }], shipTo: ship, agreeReturn: true }).success).toBe(false);
  });
  it("담기: 관심·보류만, 보류는 담으며 관심으로 전이", () => {
    expect(canAddToSample("interested")).toBe(true);
    expect(needsInterestFirst("hold")).toBe(true);
    for (const s of ["new", "reconsent_pending", "recheck", "expired", "declined"]) expect(canAddToSample(s), s).toBe(false);
    expect(canTransition("offer", "hold", "interested", "BRAND_MEMBER")).toBe(true);
  });
});

describe("금액 (D13·PRD 7)", () => {
  it("물류비 = 특송 Σ(qty × kg × 15,000) 올림 + 국내 4,000 1회, 상품가 합은 미회수 시", () => {
    const r = sampleAmounts(
      [{ qty: 2, weight_g: 480, product_price_krw: 17570 }, { qty: 1, weight_g: 1100, product_price_krw: 48390 }],
      { sample_air_per_kg_krw: 15000, domestic_shipping_krw: 4000 },
    );
    expect(r.logistics_fee_krw).toBe(14400 + 16500 + 4000);
    expect(r.product_fee_total_krw).toBe(2 * 17570 + 48390);
  });
  it("수량 0 줄은 빠진다", () => {
    expect(sampleAmounts([{ qty: 0, weight_g: 480, product_price_krw: 17570 }], { sample_air_per_kg_krw: 15000, domestic_shipping_krw: 4000 })).toEqual({ logistics_fee_krw: 4000, product_fee_total_krw: 0 });
  });
});

describe("결제 게이트·전이", () => {
  it("신규 등급 → 입금 대기, 실적 → 출고 준비", () => {
    expect(initialSampleStatus("new")).toBe("awaiting_payment");
    expect(initialSampleStatus("proven")).toBe("requested");
  });
  it("입금 확인(ADMIN)만 출고 준비로, CN은 입금 대기에서 출고 불가", () => {
    expect(canTransition("sample_request", "awaiting_payment", "requested", "ADMIN")).toBe(true);
    expect(canTransition("sample_request", "awaiting_payment", "cn_shipped", "CN_SOURCER")).toBe(false);
    expect(canTransition("sample_request", "requested", "cn_shipped", "CN_SOURCER")).toBe(true);
    expect(canTransition("sample_request", "awaiting_payment", "requested", "BRAND_OWNER")).toBe(false);
  });
  it("취소는 구매 권한자만", () => {
    expect(canTransition("sample_request", "requested", "cancelled", { role: "BRAND_MEMBER", canPurchase: false })).toBe(false);
    expect(canTransition("sample_request", "requested", "cancelled", { role: "BRAND_MEMBER", canPurchase: true })).toBe(true);
  });
  it("SLA: 입금 대기 BRAND, 출고 준비 CN", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    expect(ownerAndDue("sample_request", "awaiting_payment", now).owner_role).toBe("BRAND");
    expect(ownerAndDue("sample_request", "requested", now).owner_role).toBe("CN");
  });
});

describe("피드백·회수·청구", () => {
  it("피드백 완료 판정", () => {
    expect(feedbackComplete([{ feedback: "interested" }, { feedback: "declined" }])).toBe(true);
    expect(feedbackComplete([{ feedback: "interested" }, { feedback: null }])).toBe(false);
    expect(feedbackComplete([])).toBe(false);
  });
  it("회수 기한 경과: 반납 신청·청구 건 제외, KST 날짜 기준", () => {
    const now = new Date("2026-11-20T03:00:00Z");
    const base = { return_status: "due", charge_status: "none", return_requested_at: null };
    expect(returnOverdue(base, "2026-11-19", now)).toBe(true);
    expect(returnOverdue({ ...base, return_status: "kept" }, "2026-11-19", now), "보유 선택도 청구 확정 전엔 경과 표시").toBe(true);
    expect(returnOverdue(base, "2026-11-20", now)).toBe(false);
    expect(returnOverdue({ ...base, return_requested_at: "2026-11-18T00:00:00Z" }, "2026-11-19", now)).toBe(false);
    expect(returnOverdue({ ...base, charge_status: "charged" }, "2026-11-19", now)).toBe(false);
    expect(feedbackDue(new Date("2026-11-01T16:00:00Z"), 14)).toBe("2026-11-16");
  });
  it("출고 불가 항목은 피드백·회수·닫기 판정에서 빠진다", () => {
    expect(feedbackComplete([{ feedback: "interested", status: "ok" }, { feedback: null, status: "unavailable" }])).toBe(true);
    expect(allResolved([{ return_status: "returned", charge_status: "none", status: "ok" }, { return_status: "due", charge_status: "none", status: "unavailable" }])).toBe(true);
    expect(returnOverdue({ return_status: "due", charge_status: "none", return_requested_at: null, status: "unavailable" }, "2026-11-01", new Date("2026-11-20T00:00:00Z"))).toBe(false);
  });
  it("청구액 = 수량 × 요청 시점 단가, 닫기 = 모두 반납 또는 청구", () => {
    expect(chargeAmount({ qty: 2, product_price_krw: 17570 })).toBe(35140);
    expect(allResolved([{ return_status: "returned", charge_status: "none" }, { return_status: "kept", charge_status: "charged" }])).toBe(true);
    expect(allResolved([{ return_status: "kept", charge_status: "none" }])).toBe(false);
  });
});
