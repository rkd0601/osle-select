import { describe, it, expect } from "vitest";
import {
  ceil10, productPriceKrw, supplyPriceKrw, buildPriceTiers, pickTier,
  sampleLogisticsFeeKrw, sampleProductFeeKrw, orderTotals, depositKrw, fxNeedsRecheck,
} from "@/lib/pricing";

const ctx = { fx_rate: 200, hidden_margin_rate: 0.2, fee_rate: 0.2 };

describe("pricing", () => {
  it("10원 단위 올림", () => {
    expect(ceil10(17568)).toBe(17570);
    expect(ceil10(17570)).toBe(17570);
    expect(ceil10(0)).toBe(0);
  });

  it("상품가 = 원가 × 환율 × 1.20 (라인시트 KFC-26FW01602 ¥73.2)", () => {
    expect(productPriceKrw(73.2, ctx)).toBe(17570); // 73.2*200*1.2 = 17568 → 17570
  });

  it("공급가 = 상품가 × 1.20 (수수료 노출)", () => {
    expect(supplyPriceKrw(17570, 0.2)).toBe(21090); // 21084 → 21090
  });

  it("tier는 수량 비단조 감소면 거부", () => {
    expect(() => buildPriceTiers([{ min_qty: 30, cost_cny: 70 }, { min_qty: 100, cost_cny: 75 }], ctx)).toThrow();
  });

  it("tier 선택: 총수량 이상 중 최대 min_qty, 최소 tier 미만이면 최소 tier", () => {
    const tiers = buildPriceTiers([{ min_qty: 30, cost_cny: 73.2 }, { min_qty: 100, cost_cny: 68 }, { min_qty: 300, cost_cny: 64 }], ctx);
    expect(pickTier(tiers, 10).min_qty).toBe(30);
    expect(pickTier(tiers, 120).min_qty).toBe(100);
    expect(pickTier(tiers, 300).min_qty).toBe(300);
  });

  it("샘플 물류비 = qty×중량×kg당 + 국내 배송, 한 금액", () => {
    const fee = sampleLogisticsFeeKrw([{ weight_g: 480, qty: 2, product_price_krw: 17570 }, { weight_g: 900, qty: 1, product_price_krw: 41760 }], 15000, 4000);
    // 2*0.48*15000=14400 + 0.9*15000=13500 = 27900 → +4000 = 31900
    expect(fee).toBe(31900);
    expect(sampleProductFeeKrw([{ weight_g: 480, qty: 2, product_price_krw: 17570 }])).toBe(35140);
  });

  it("발주 금액: 소계·수수료·옵션·미회수 샘플 1회 차감·선금·크레딧", () => {
    const tiers = buildPriceTiers([{ min_qty: 30, cost_cny: 73.2 }, { min_qty: 100, cost_cny: 68 }], ctx);
    const t = orderTotals({
      lines: [{ variant_id: "a", qty: 40 }, { variant_id: "b", qty: 40 }, { variant_id: "c", qty: 40 }],
      price_tiers: tiers,
      fee_rate: 0.2,
      options: [{ label: "메인 라벨", qty_basis: 120, unit_cost_cny: 2 }],
      option_ctx: ctx,
      kept_samples: [{ product_price_krw: 17570, qty: 1, already_deducted: false }, { product_price_krw: 17570, qty: 1, already_deducted: true }],
      deposit_paid_krw: 500000,
      credit_krw: 12000,
      logistics_final_krw: 312000,
    });
    expect(t.total_qty).toBe(120);
    expect(t.applied_tier.min_qty).toBe(100);
    expect(t.applied_tier.product_price_krw).toBe(16320); // 68*200*1.2
    expect(t.subtotal_krw).toBe(120 * 16320);
    expect(t.fee_krw).toBe(ceil10(120 * 16320 * 0.2));
    expect(t.options_krw).toBe(120 * 480); // 2*200*1.2=480
    expect(t.sample_deduction_krw).toBe(17570); // 이미 차감된 건 제외
    expect(t.total_krw).toBe(t.subtotal_krw + t.fee_krw + t.options_krw - 17570 - 500000 - 12000 + 312000);
  });

  it("선금 = (소계+수수료) × 선금율, 0..1", () => {
    expect(depositKrw(1000000, 200000, 0.3)).toBe(360000);
    expect(() => depositKrw(1, 1, 1.5)).toThrow();
  });

  it("환율 ±3% 재확인", () => {
    expect(fxNeedsRecheck(200, 206, 0.03)).toBe(true);
    expect(fxNeedsRecheck(200, 204, 0.03)).toBe(false);
  });
});
