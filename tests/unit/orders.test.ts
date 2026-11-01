import { describe, it, expect } from "vitest";
import { belowMinQty, creditAmount, infoMatchRate, orderDeposit, orderEligible, orderInvoice, qtyOverConfirmed, ReserveInput, scheduleCheck, stockAggregate } from "@/lib/orders";
import { canTransition, allowedNext } from "@/lib/transitions";

const O1 = "70000000-0000-0000-0000-000000000001";
const V1 = "80000000-0000-0000-0000-000000000001";
const tiers = [{ min_qty: 30, product_price_krw: 17570 }, { min_qty: 100, product_price_krw: 16320 }];

describe("담기 조건 (절대 규칙 7)", () => {
  it("제안 관심 AND 샘플 관심, 예외 리오더·면제", () => {
    expect(orderEligible({ status: "interested", sampleFeedbacks: ["interested"], hasReorder: false })).toBe(true);
    expect(orderEligible({ status: "interested", sampleFeedbacks: ["hold", "interested"], hasReorder: false }), "variant 중 하나라도 관심").toBe(true);
    expect(orderEligible({ status: "interested", sampleFeedbacks: [], hasReorder: false }), "샘플 없음").toBe(false);
    expect(orderEligible({ status: "interested", sampleFeedbacks: ["declined"], hasReorder: false })).toBe(false);
    expect(orderEligible({ status: "hold", sampleFeedbacks: ["interested"], hasReorder: false })).toBe(false);
    expect(orderEligible({ status: "interested", sampleFeedbacks: [], hasReorder: true }), "리오더").toBe(true);
    expect(orderEligible({ status: "hold", sampleFeedbacks: [], hasReorder: false, adminWaived: true }), "관리자 면제").toBe(true);
  });
});

describe("1단계 예약 입력·일정 (F5)", () => {
  const base = { gbOpen: "2026-11-10", gbClose: "2026-11-17", deliveryPromise: "2026-12-10", lines: [{ offerId: O1, variantId: V1, expectedQty: 50 }], holdChoice: "deposit" as const, holdAck: false };
  it("오픈 < 마감, 수량 1 이상, 홀딩 없이면 고지 동의", () => {
    expect(ReserveInput.safeParse(base).success).toBe(true);
    expect(ReserveInput.safeParse({ ...base, gbClose: "2026-11-09" }).error?.issues[0].message).toBe("order.error.dates");
    expect(ReserveInput.safeParse({ ...base, holdChoice: "none" }).error?.issues[0].message).toBe("order.error.holdAck");
    expect(ReserveInput.safeParse({ ...base, holdChoice: "none", holdAck: true }).success).toBe(true);
    expect(ReserveInput.safeParse({ ...base, lines: [{ offerId: O1, variantId: V1, expectedQty: 0 }] }).success).toBe(false);
  });
  it("배송 약속일 − 마감 < 리드타임 + 물류일: 현물은 경고, 생산은 차단", () => {
    const v = { gbClose: "2026-11-17", deliveryPromise: "2026-11-25" }; // 8일
    expect(scheduleCheck(v, [{ supply_type: "stock", lead_days: 0 }], 10)).toEqual({ block: null, warnings: ["order.warn.schedule"] });
    expect(scheduleCheck(v, [{ supply_type: "production", lead_days: 15 }], 10).block).toBe("order.error.scheduleProduction");
    expect(scheduleCheck({ gbClose: "2026-11-17", deliveryPromise: "2026-12-30" }, [{ supply_type: "production", lead_days: 15 }], 10)).toEqual({ block: null, warnings: [] });
  });
  it("최소 수량 미달 제안", () => {
    expect(belowMinQty([{ offerId: "a", qty: 20, minQty: 30 }, { offerId: "b", qty: 30, minQty: 30 }, { offerId: "c", qty: 0, minQty: 30 }])).toEqual(["a"]);
  });
});

describe("체인 순서 (절대 규칙 7)", () => {
  it("선금은 재고 확인 뒤에만, 견적 전 수량 확정 불가, 확정은 최종 견적 뒤", () => {
    expect(canTransition("order", "reserved", "deposit_pending", "ADMIN")).toBe(false);
    expect(canTransition("order", "stock_checking", "deposit_pending", "ADMIN")).toBe(false);
    expect(canTransition("order", "stock_confirmed", "deposit_pending", "ADMIN")).toBe(true);
    expect(canTransition("order", "reserved", "qty_confirmed", { role: "BRAND_OWNER", canPurchase: true })).toBe(false);
    expect(canTransition("order", "quoted", "qty_confirmed", { role: "BRAND_OWNER", canPurchase: true })).toBe(true);
    expect(canTransition("order", "quoted", "qty_confirmed", { role: "BRAND_MEMBER", canPurchase: false })).toBe(false);
    expect(canTransition("order", "qty_confirmed", "confirmed", "ADMIN")).toBe(false);
    expect(canTransition("order", "final_quoted", "confirmed", "ADMIN")).toBe(true);
    expect(allowedNext("order", "stock_checking", "CN_SOURCER").sort()).toEqual(["partial_confirmed", "stock_confirmed", "stock_short"]);
  });
  it("재고 응답 집계", () => {
    expect(stockAggregate([{ stock_result: "confirmed" }, { stock_result: "confirmed" }])).toBe("stock_confirmed");
    expect(stockAggregate([{ stock_result: "confirmed" }, { stock_result: "short" }])).toBe("partial_confirmed");
    expect(stockAggregate([{ stock_result: "short" }])).toBe("stock_short");
    expect(stockAggregate([{ stock_result: "confirmed" }, { stock_result: "pending" }])).toBeNull();
  });
  it("수량 확정은 확보 수량 이내", () => {
    expect(qtyOverConfirmed([{ id: "l1", qty: 40, confirmed_qty: 30, expected_qty: 50 }, { id: "l2", qty: 50, confirmed_qty: null, expected_qty: 50 }])).toEqual(["l1"]);
  });
});

describe("청구 내역 (PRD 7)", () => {
  it("제안별 tier = 그 제안 총수량, 수수료 20%, 미회수 샘플 1회 차감, 선금·크레딧 차감, 물류 가산", () => {
    const inv = orderInvoice({
      groups: [{ offerId: O1, price_tiers: tiers, fee_rate: 0.2, lines: [{ lineId: "a", qty: 60 }, { lineId: "b", qty: 50 }] }],
      options: [{ offerId: O1, label: "main_label", qty: 110, unit_price_krw: 480 }],
      keptSamples: [{ offerId: O1, charged_krw: 17570, already_deducted: false }, { offerId: O1, charged_krw: 17570, already_deducted: true }, { offerId: "other", charged_krw: 9999, already_deducted: false }],
      deposit_paid_krw: 500000, credit_krw: 10000, logistics_final_krw: 120000,
    });
    expect(inv.groups[0]).toMatchObject({ qty: 110, tier_min_qty: 100, product_price_krw: 16320, unit_supply_krw: 19590 });
    expect(inv.subtotal_krw).toBe(110 * 16320);
    expect(inv.fee_krw).toBe(359040);
    expect(inv.options_krw).toBe(52800);
    expect(inv.sample_deduction_krw).toBe(17570);
    expect(inv.total_krw).toBe(1795200 + 359040 + 52800 - 17570 - 500000 - 10000 + 120000);
  });
  it("선금 = (예상 소계 + 수수료) × 율", () => {
    expect(orderDeposit([{ offerId: O1, price_tiers: tiers, fee_rate: 0.2, lines: [{ lineId: "a", qty: 50 }] }], 0.3)).toBe(Math.ceil((50 * 17570 * 1.2 * 0.3) / 10) * 10);
  });
  it("정보 일치율·불량 크레딧", () => {
    expect(infoMatchRate([{ match: true }, { match: true }, { match: false }])).toBe(66.7);
    expect(infoMatchRate([])).toBeNull();
    expect(creditAmount([{ defect_qty: 2, unit_price_krw: 21090 }, { defect_qty: 0, unit_price_krw: 21090 }])).toBe(42180);
  });
});
