import { describe, expect, it } from "vitest";
import { filterCounts, progressCard, sortCards, type ProgressRow } from "@/lib/brand-progress";
import { fmtDay } from "@/lib/format";
import ko from "@/lib/i18n/ko.json";

/** 진행 카드(디자인 v2.2) — 한 행이 어느 단계·누구 차례·어떤 문장인지 */
const base: ProgressRow = {
  request_item_id: "i1", request_id: "r1", brand_id: "b1", request_title: "에코퍼 F/W", request_created_at: "2026-11-01T00:00:00Z",
  item_seq: 1, item_description: "에코퍼 크롭 자켓", item_category: "아우터", item_status: "sourcing", item_owner_role: "CN", item_due_at: "2026-11-07T00:00:00Z",
  offer_id: null, product_id: null, offer_status: null, offer_reaction: null, price_tiers: null, fee_rate: null, exclusive_until: null, valid_until: null, offer_issued_at: null,
  sample_request_id: null, sample_status: null, sample_owner_role: null, sample_due_at: null, sample_qty: null, sample_feedback: null, sample_return_status: null,
  sample_feedback_due: null, sample_return_due: null, sample_payment_reported_at: null,
  order_id: null, order_status: null, order_owner_role: null, order_due_at: null, order_qty: null, order_deposit_reported_at: null, order_report_due: null, order_created_at: null,
};
const offer = { ...base, offer_id: "f1", product_id: "p1", offer_status: "new", price_tiers: [{ min_qty: 30, product_price_krw: 17570 }], fee_rate: 0.2, exclusive_until: "2026-11-18", offer_issued_at: "2026-11-02T00:00:00Z" };
const K = ko as Record<string, string>;

describe("progressCard", () => {
  it("제안 없는 항목 = 요청 단계, 찾는 중", () => {
    const c = progressCard(base);
    expect([c.kind, c.stage, c.mine, c.stateKey, c.href]).toEqual(["request", 1, false, "state.request.sourcing", "/requests/r1"]);
  });
  it("보완 요청 = 내 할 일", () => {
    const c = progressCard({ ...base, item_status: "needs_info", item_owner_role: "BRAND" });
    expect(c.mine).toBe(true);
    expect(c.filters).toContain("mine");
  });
  it("새 제안 = 할 일 + '새 제안' 라벨, 기한은 독점 기한", () => {
    const c = progressCard(offer);
    expect([c.kind, c.stage, c.mine, c.isNew, c.due, c.href]).toEqual(["offer", 2, true, true, "2026-11-18", "/offers/f1"]);
  });
  it("관심 표시한 제안은 할 일 아님", () => {
    const c = progressCard({ ...offer, offer_status: "interested", offer_reaction: "interested" });
    expect([c.mine, c.stateKey]).toEqual([false, "state.offer.interested"]);
  });
  it("거절·만료 제안 = 끝", () => {
    expect(progressCard({ ...offer, offer_status: "declined" }).filters).toEqual(["done"]);
  });
  it("샘플: 입금 신고 뒤에는 위아더 차례", () => {
    const s = { ...offer, offer_status: "interested", sample_request_id: "s1", sample_status: "awaiting_payment", sample_owner_role: "BRAND", sample_due_at: "2026-11-06T00:00:00Z" };
    expect(progressCard(s).mine).toBe(true);
    const r = progressCard({ ...s, sample_payment_reported_at: "2026-11-05T00:00:00Z" });
    expect([r.mine, r.stateKey]).toEqual([false, "state.sample.payment_reported"]);
  });
  it("샘플 피드백 후 회수 대기 = 할 일, 기한은 회수 기한", () => {
    const c = progressCard({ ...offer, sample_request_id: "s1", sample_status: "feedback_done", sample_return_status: "due", sample_return_due: "2026-11-18T12:00:00Z" });
    expect([c.kind, c.mine, c.stateKey, c.due]).toEqual(["sample", true, "state.sample.return_due", "2026-11-18T12:00:00Z"]);
  });
  it("발주가 있으면 발주 카드(발주서마다), 최종 견적 = 브랜드 차례", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "final_quoted", order_owner_role: "BRAND", order_qty: 35, order_created_at: "2026-11-04T00:00:00Z" });
    expect([c.kind, c.stage, c.mine, c.qty, c.href]).toEqual(["order", 4, true, 35, "/orders/o1"]);
  });
  it("최종 견적에 동의한 뒤(위아더 차례) = 동의함 문장, 할 일 아님", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "final_quoted", order_owner_role: "ADMIN" });
    expect([c.mine, c.stateKey]).toEqual([false, "state.order.final_agreed"]);
  });
  it("선금 신고 뒤 = 확인 중 문장, 할 일 아님", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "deposit_pending", order_owner_role: "BRAND", order_deposit_reported_at: "2026-11-04T00:00:00Z" });
    expect([c.mine, c.stateKey]).toEqual([false, "state.order.deposit_reported"]);
  });
  it("검수 보고 완료 = 끝(5단계)", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "report_done", order_owner_role: null });
    expect([c.stage, c.done, c.filters]).toEqual([5, true, ["done"]]);
  });
  it("모든 상태 문장 키가 ko 사전에 있다", () => {
    const statuses: Partial<ProgressRow>[] = [
      ...["received", "needs_info", "assigned", "sourcing", "offered", "selected", "on_hold", "closed", "cancelled"].map((s) => ({ item_status: s })),
      ...["new", "reconsent_pending", "declined", "expired"].map((s) => ({ ...offer, offer_status: s })),
      ...["requested", "awaiting_payment", "cn_shipped", "kr_arrived", "inspected", "sent_to_brand", "delivered", "closed"].map((s) => ({ ...offer, sample_request_id: "s", sample_status: s })),
      ...["reserved", "stock_checking", "stock_confirmed", "partial_confirmed", "stock_short", "deposit_pending", "hold_confirmed", "quoting", "quoted", "qty_confirmed", "final_quoted", "confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"]
        .map((s) => ({ ...offer, order_id: "o", order_status: s })),
    ];
    for (const p of statuses) {
      const k = progressCard({ ...base, ...p } as ProgressRow).stateKey;
      expect(K[k], k).toBeTruthy();
    }
  });
});

describe("정렬·건수", () => {
  it("할 일 먼저, 할 일끼리는 기한 순", () => {
    const a = progressCard({ ...offer, offer_id: "a", exclusive_until: "2026-11-20" });
    const b = progressCard({ ...offer, offer_id: "b", exclusive_until: "2026-11-10" });
    const c = progressCard(base);
    expect(sortCards([c, a, b]).map((x) => x.key)).toEqual(["f-b", "f-a", "r-i1"]);
    expect(filterCounts([a, b, c])).toMatchObject({ all: 3, mine: 2, offer: 2 });
  });
});

describe("fmtDay", () => {
  it("11월 18일 (KST, 같은 해)", () => {
    expect(fmtDay("2026-11-18T03:00:00Z", new Date("2026-11-04T00:00:00Z"))).toBe("11월 18일");
    expect(fmtDay("2026-11-18", new Date("2026-11-04T00:00:00Z"))).toBe("11월 18일");
  });
  it("UTC 15시 이후는 다음 날, 다른 해는 연도", () => {
    expect(fmtDay("2026-11-18T15:30:00Z", new Date("2026-11-04T00:00:00Z"))).toBe("11월 19일");
    expect(fmtDay("2027-01-05T00:00:00Z", new Date("2026-11-04T00:00:00Z"))).toBe("2027년 1월 5일");
  });
});
