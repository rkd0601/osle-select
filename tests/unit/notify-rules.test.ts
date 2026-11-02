import { describe, it, expect } from "vitest";
import ko from "@/lib/i18n/ko.json";
import zh from "@/lib/i18n/zh-CN.json";
import { digestDue, EVENT_AUDIENCE, INSTANT, kindOf, type NotifyType } from "@/lib/notify-rules";

/** 알림 라우팅 전수 (STEP8 계획 "이벤트별 수신 역할·kind 표"). EVENT_AUDIENCE는 타입이 전수를 강제한다 */
const TYPES = Object.keys(EVENT_AUDIENCE) as NotifyType[];

describe("notify 라우팅 전수", () => {
  it("모든 이벤트에 ko·zh 제목 템플릿이 있다 (규칙 10)", () => {
    for (const t of TYPES) {
      expect((ko as Record<string, string>)[`notify.${t}.title`], `ko ${t}`).toBeTruthy();
      expect((zh as Record<string, string>)[`notify.${t}.title`], `zh ${t}`).toBeTruthy();
    }
  });
  it("INSTANT는 알려진 이벤트만", () => {
    for (const t of INSTANT) expect(TYPES, t).toContain(t);
  });
  it("D17: 공이 넘어오는 순간·돈·기한은 즉시, 진행 상황은 digest", () => {
    const instant: NotifyType[] = [
      "request_item.needs_info", "request_item.assigned", "cn_question.created", "product.review_requested", "product.rejected",
      "sample.requested", "sample.payment_reported", "sample.ready_to_ship", "sample.charged",
      "order.reserved", "order.stock_check", "order.stock_done", "order.deposit_requested", "order.deposit_reported", "order.quoted",
      "order.qty_confirmed", "order.final_quoted", "order.ship", "order.sent", "order.backorder", "order.backorder_choice", "order.reported",
      "sla.overdue", "cn_question.released",
    ];
    for (const t of instant) expect(kindOf(t), t).toBe("instant");
    for (const t of ["offer.issued", "offer.expired", "order.confirmed", "order.credit", "sample.sent", "notify.delivery_failed"] as NotifyType[]) expect(kindOf(t), t).toBe("digest");
  });
  it("브랜드 이벤트는 CN에 가지 않고, CN 이벤트는 브랜드에 가지 않는다", () => {
    for (const t of TYPES.filter((x) => x.startsWith("order.") && EVENT_AUDIENCE[x] === "cn")) expect(["order.stock_check", "order.ship"]).toContain(t);
    for (const t of ["offer.issued", "order.quoted", "order.final_quoted", "order.confirmed", "order.credit", "sample.charged"] as NotifyType[]) expect(EVENT_AUDIENCE[t], t).toBe("brand");
    for (const t of ["product.rejected", "product.approved", "sample.ready_to_ship", "request_item.assigned"] as NotifyType[]) expect(EVENT_AUDIENCE[t], t).toBe("cn");
  });
  it("발송 실패 알림은 digest — 실패 알림이 다시 즉시 발송되며 맴돌지 않는다", () => {
    expect(kindOf("notify.delivery_failed")).toBe("digest");
    expect(EVENT_AUDIENCE["notify.delivery_failed"]).toBe("admin");
  });
  it("digest 시각: ko 00 UTC(09:00 KST), zh-CN 01 UTC(09:00 CST)", () => {
    expect(digestDue("ko", 0)).toBe(true);
    expect(digestDue("ko", 1)).toBe(false);
    expect(digestDue("zh-CN", 0)).toBe(false);
    expect(digestDue("zh-CN", 1)).toBe(true);
    expect(digestDue("ko", 9), "수동 실행은 ko만").toBe(true);
  });
});
