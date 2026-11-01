import { describe, it, expect } from "vitest";
import { computeOfferFixed, exclusiveDday, issueBlocker, offerDates, offerType, statusAfterReapproval } from "@/lib/offers";
import { offerPreview, optionPricesKrw, resolveRates, targetDiffPct } from "@/lib/pricing";
import { canTransition } from "@/lib/transitions";

const S = { fee_rate: 0.2, hidden_margin_rate: 0.2, fx_rate_cny_krw: 200 };

describe("발행 미리보기 (A-04, 시드 라인시트 재현)", () => {
  it("¥73.2 × 200 × 1.20 = 상품가 17,570 → 공급가 21,090, 미회수 샘플 상품가 = 최소 tier", () => {
    const ctx = resolveRates({ fee_rate: null, hidden_margin_rate: null }, S);
    const p = offerPreview([{ min_qty: 30, cost_cny: 73.2 }, { min_qty: 100, cost_cny: 68 }], ctx);
    expect(p.price_tiers[0]).toEqual({ min_qty: 30, product_price_krw: 17570 });
    expect(p.supply_tiers[0]).toEqual({ min_qty: 30, supply_price_krw: 21090 });
    expect(p.price_tiers[1].product_price_krw).toBe(16320);
    expect(p.sample_fee_product_krw).toBe(17570);
  });
  it("브랜드 오버라이드가 설정보다 우선", () => {
    const ctx = resolveRates({ fee_rate: 0.15, hidden_margin_rate: 0.25 }, S);
    expect(ctx).toEqual({ fx_rate: 200, fee_rate: 0.15, hidden_margin_rate: 0.25 });
  });
  it("희망 단가 대비 %", () => {
    expect(targetDiffPct(20000, 21090)).toBe(5.5);
    expect(targetDiffPct(22000, 21090)).toBe(-4.1);
    expect(targetDiffPct(null, 21090)).toBeNull();
  });
  it("옵션은 원가×환율×(1+마진)만, 수수료 없음, 결과에 원가 키 없음", () => {
    const ctx = resolveRates({ fee_rate: null, hidden_margin_rate: null }, S);
    const o = optionPricesKrw([{ type: "main_label", moq: 100, unit_cost_cny: 2, lead_days: 5 }], [{ item: "add_color", moq: 300, cost_cny: 1.5, lead_days: 7 }], ctx);
    expect(o.labels[0]).toEqual({ type: "main_label", moq: 100, unit_price_krw: 480, lead_days: 5 });
    expect(o.mods[0].price_krw).toBe(360);
    expect(JSON.stringify(o)).not.toMatch(/cost_cny|unit_cost/);
  });
});

describe("제안 유형·날짜 (D8·D15)", () => {
  it("항목 없으면 추천(비독점), 이전 제안 있으면 재제안", () => {
    expect(offerType(null, 0)).toBe("recommend");
    expect(offerType("i1", 0)).toBe("request");
    expect(offerType("i1", 2)).toBe("reoffer");
  });
  it("독점 14일·유효 30일, 추천은 독점 없음", () => {
    const now = new Date("2026-11-01T03:00:00Z");
    expect(offerDates("request", now, { exclusive_days: 14, offer_valid_days: 30 })).toEqual({ exclusive_until: "2026-11-15", valid_until: "2026-12-01" });
    expect(offerDates("recommend", now, { exclusive_days: 14, offer_valid_days: 30 }).exclusive_until).toBeNull();
  });
  it("독점 D-day", () => {
    expect(exclusiveDday("2026-11-15", new Date("2026-11-04T03:00:00Z"))).toBe(12);
    expect(exclusiveDday("2026-11-01", new Date("2026-11-04T03:00:00Z"))).toBe(0);
    expect(exclusiveDday(null, new Date())).toBeNull();
  });
});

describe("발행 차단 (D15)", () => {
  const today = new Date("2026-11-05T03:00:00Z");
  const A = "brand-a", B = "brand-b";
  it("다른 브랜드 독점 기간 중이면 재제안 불가, 끝났거나 거절·만료면 가능", () => {
    expect(issueBlocker([{ brand_id: A, request_item_id: "i1", status: "new", exclusive_until: "2026-11-15" }], { brandId: B, requestItemId: "j1" }, today)).toBe("offer.error.exclusive");
    expect(issueBlocker([{ brand_id: A, request_item_id: "i1", status: "new", exclusive_until: "2026-11-01" }], { brandId: B, requestItemId: "j1" }, today)).toBeNull();
    expect(issueBlocker([{ brand_id: A, request_item_id: "i1", status: "declined", exclusive_until: "2026-11-15" }], { brandId: B, requestItemId: "j1" }, today)).toBeNull();
  });
  it("같은 브랜드·같은 항목의 살아 있는 제안은 중복, 만료 후엔 가능", () => {
    expect(issueBlocker([{ brand_id: A, request_item_id: "i1", status: "hold", exclusive_until: null }], { brandId: A, requestItemId: "i1" }, today)).toBe("offer.error.duplicate");
    expect(issueBlocker([{ brand_id: A, request_item_id: "i1", status: "expired", exclusive_until: null }], { brandId: A, requestItemId: "i1" }, today)).toBeNull();
    expect(issueBlocker([{ brand_id: A, request_item_id: null, status: "new", exclusive_until: null }], { brandId: A, requestItemId: null }, today)).toBe("offer.error.duplicate");
  });
});

describe("재승인 후 제안 상태 (D16)", () => {
  const tiers = [{ min_qty: 30, product_price_krw: 17570 }];
  it("가격 같으면 이전 반응 복원, 다르면 재동의 대기", () => {
    expect(statusAfterReapproval({ status_before_recheck: "interested", price_tiers: tiers }, tiers)).toBe("interested");
    expect(statusAfterReapproval({ status_before_recheck: "hold", price_tiers: tiers }, tiers)).toBe("hold");
    expect(statusAfterReapproval({ status_before_recheck: null, price_tiers: tiers }, tiers)).toBe("new");
    expect(statusAfterReapproval({ status_before_recheck: "interested", price_tiers: tiers }, [{ min_qty: 30, product_price_krw: 18000 }])).toBe("reconsent_pending");
    expect(statusAfterReapproval({ status_before_recheck: "interested", price_tiers: tiers, fee_rate: 0.2 }, tiers, 0.15), "수수료만 바뀌어도 재동의").toBe("reconsent_pending");
    expect(statusAfterReapproval({ status_before_recheck: "hold", price_tiers: tiers, fee_rate: 0.2 }, tiers, 0.2)).toBe("hold");
  });
  it("결과 상태는 모두 전이 테이블에 있다 (recheck → x, ADMIN)", () => {
    for (const s of ["new", "interested", "hold", "reconsent_pending"]) expect(canTransition("offer", "recheck", s, "ADMIN"), s).toBe(true);
  });
});

describe("offers 1행 고정값 (computeOfferFixed)", () => {
  it("시드 상품: 상품가 17,570, 샘플 물류비 = 0.48kg × 15,000 → 7,200 + 국내 4,000, 옵션 KRW", () => {
    const r = computeOfferFixed({
      costTiers: [{ min_qty: 30, cost_cny: 73.2 }], weightG: 480,
      labels: [{ type: "main_label", moq: 100, unit_cost_cny: 2, lead_days: 5 }], mods: [],
      brand: { fee_rate: null, hidden_margin_rate: null },
      settings: { fee_rate: 0.2, hidden_margin_rate: 0.2, fx_rate_cny_krw: 200, sample_air_per_kg_krw: 15000, domestic_shipping_krw: 4000 },
    });
    expect(r.price_tiers[0].product_price_krw).toBe(17570);
    expect(r.sample_logistics_krw).toBe(11200);
    expect(r.sample_fee_product_krw).toBe(17570);
    expect(r.option_prices.labels[0].unit_price_krw).toBe(480);
    expect({ fee: r.fee_rate, m: r.hidden_margin_rate, fx: r.fx_rate }).toEqual({ fee: 0.2, m: 0.2, fx: 200 });
  });
});
