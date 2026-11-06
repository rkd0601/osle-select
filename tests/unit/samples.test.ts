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
  it("v2(d-26): 등급과 관계없이 바로 출고 준비 — 입금 대기로 가는 간선 없음", () => {
    expect(initialSampleStatus("new")).toBe("requested");
    expect(initialSampleStatus("proven")).toBe("requested");
    expect(canTransition("sample_request", "requested", "awaiting_payment", "ADMIN")).toBe(false);
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

describe("샘플 v2 (§0-l S3·S4, d-26·d-27)", () => {
  it("구매가 = 최소 수량 구간 공급가 × (1 + 소량 비율), 10원 올림 — 프로토타입 ₩21,090 → ₩23,200", async () => {
    const { samplePurchasePriceKrw, supplyPriceKrw } = await import("@/lib/pricing");
    const tiers = [{ min_qty: 50, product_price_krw: 15000 }, { min_qty: 1, product_price_krw: 17575 }];
    expect(supplyPriceKrw(17575, 0.2)).toBe(21090);
    expect(samplePurchasePriceKrw(tiers, 0.2, 0.1)).toBe(23200);
    expect(samplePurchasePriceKrw([{ min_qty: 1, product_price_krw: 17500 }], 0.2, 0.1)).toBe(23100); // 21,000 × 1.1 — 부동소수 오차로 23,110이 되지 않게
    expect(samplePurchasePriceKrw([], 0.2, 0.1)).toBe(0);
    expect(samplePurchasePriceKrw(tiers, 0.2, 0)).toBe(21090);
  });
  it("자동 구매 3일 전 알림: 결정 전 · 기한까지 0~3일", async () => {
    const { purchaseReminderDue } = await import("@/lib/samples");
    const it0 = { return_status: "due", charge_status: "none", return_requested_at: null, status: "ok" };
    const now = new Date("2026-11-15T01:00:00Z"); // KST 11-15
    expect(purchaseReminderDue(it0, "2026-11-18", now)).toBe(true);
    expect(purchaseReminderDue(it0, "2026-11-19", now)).toBe(false);
    expect(purchaseReminderDue(it0, "2026-11-14", now)).toBe(false); // 이미 지남 → 자동 구매 몫
    expect(purchaseReminderDue({ ...it0, return_requested_at: "2026-11-14T00:00:00Z" }, "2026-11-18", now)).toBe(false);
    expect(purchaseReminderDue({ ...it0, return_status: "kept" }, "2026-11-18", now)).toBe(false);
    expect(purchaseReminderDue({ ...it0, status: "unavailable" }, "2026-11-18", now)).toBe(false);
  });
  it("자동 구매: 기한 다음 날부터, 반납 신청·구매·청구된 건 제외", async () => {
    const { autoPurchaseDue } = await import("@/lib/samples");
    const it0 = { return_status: "due", charge_status: "none", return_requested_at: null, status: "ok" };
    expect(autoPurchaseDue(it0, "2026-11-18", new Date("2026-11-18T10:00:00Z"))).toBe(false); // KST 11-18 당일
    expect(autoPurchaseDue(it0, "2026-11-18", new Date("2026-11-18T16:00:00Z"))).toBe(true); // KST 11-19
    expect(autoPurchaseDue({ ...it0, return_requested_at: "x" }, "2026-11-18", new Date("2026-11-20T00:00:00Z"))).toBe(false);
    expect(autoPurchaseDue({ ...it0, charge_status: "charged" }, "2026-11-18", new Date("2026-11-20T00:00:00Z"))).toBe(false);
  });
  it("결정 상태(관리자 S7 열): 돌려보냄 · 반납 중 · 구매 · 대기", async () => {
    const { sampleDecision } = await import("@/lib/samples");
    expect(sampleDecision({ return_status: "returned", charge_status: "none", return_requested_at: "x" })).toBe("returned");
    expect(sampleDecision({ return_status: "due", charge_status: "none", return_requested_at: "x" })).toBe("return_requested");
    expect(sampleDecision({ return_status: "kept", charge_status: "none", return_requested_at: null })).toBe("purchased");
    expect(sampleDecision({ return_status: "kept", charge_status: "charged", return_requested_at: null })).toBe("purchased");
    expect(sampleDecision({ return_status: "due", charge_status: "none", return_requested_at: null })).toBe("pending");
  });
  it("구매는 구매 권한자만, 자동 구매는 시스템(ADMIN)이 due → kept", () => {
    expect(canTransition("sample_item_return", "due", "kept", { role: "BRAND_MEMBER", canPurchase: false })).toBe(false);
    expect(canTransition("sample_item_return", "due", "kept", { role: "BRAND_MEMBER", canPurchase: true })).toBe(true);
    expect(canTransition("sample_item_return", "due", "kept", { role: "ADMIN", canPurchase: true })).toBe(true);
  });
});
