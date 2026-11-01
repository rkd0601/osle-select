import { describe, it, expect } from "vitest";
import { avgMatchRate, offerInterestRate, overdueShare, sampleToOrderRate } from "@/lib/kpi";

describe("A-01 KPI", () => {
  it("정보 일치율 평균 (numeric 문자열 허용, null 제외)", () => {
    expect(avgMatchRate([{ info_match_rate: "100.00" }, { info_match_rate: 80 }, { info_match_rate: null }])).toBe(90);
    expect(avgMatchRate([])).toBeNull();
  });
  it("제안 → 관심: 반응 없는 new는 분모 제외", () => {
    expect(offerInterestRate([
      { status: "interested", reaction: "interested" }, { status: "declined", reaction: "declined" },
      { status: "new", reaction: null }, { status: "expired", reaction: "interested" },
    ])).toBe(66.7);
  });
  it("샘플 → 발주 전환", () => {
    expect(sampleToOrderRate(["a", "b", "a"], ["a", "c"])).toBe(50);
    expect(sampleToOrderRate([], ["a"])).toBeNull();
  });
  it("기한 초과 비율", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    expect(overdueShare([{ due_at: "2026-10-31T00:00:00Z" }, { due_at: "2026-11-02T00:00:00Z" }, { due_at: null }], now)).toBe(50);
  });
});
