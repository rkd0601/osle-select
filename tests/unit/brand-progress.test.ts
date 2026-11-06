import { describe, expect, it } from "vitest";
import { cardActionHref, cardSentence, cardsFromRows, cartCards, cartHref, todoCount, filterCounts, groupCards, itemName, progressCard, progressCards, sortCards, type ProgressRow } from "@/lib/brand-progress";
import { countInOrder, nowName, offerProgress, type OfferSampleRow } from "@/lib/brand-state";
import { linkDomain } from "@/lib/request-links";
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

describe("샘플 할 일 (3차 검증 C1 — lib/handoff.ts 브랜드 차례와 같은 규칙)", () => {
  const smp = { ...offer, offer_status: "interested", offer_reaction: "interested", sample_request_id: "s1", sample_owner_role: "ADMIN" } as ProgressRow;
  const at = (p: Partial<ProgressRow>) => progressCard({ ...smp, ...p });
  it("입금 신고 전 = 할 일(입금), owner_role과 무관", () => {
    const c = at({ sample_status: "awaiting_payment" });
    expect([c.mine, c.stateKey, c.filters]).toEqual([true, "state.sample.awaiting_payment", ["mine", "sample"]]);
  });
  it("받음(delivered) = 할 일(피드백), 기한은 피드백 기한", () => {
    const c = at({ sample_status: "delivered", sample_feedback_due: "2026-11-10T00:00:00Z" });
    expect([c.mine, c.stateKey, c.due]).toEqual([true, "state.sample.delivered", "2026-11-10T00:00:00Z"]);
  });
  it("피드백 끝 + 회수 대기(신청 전) = 할 일(회수 선택)", () => {
    expect(at({ sample_status: "feedback_done", sample_return_status: "due" }).mine).toBe(true);
  });
  it("회수 신청 뒤 = 할 일 아님, '회수 신청 · 확인 중', 아직 끝 아님", () => {
    const c = at({ sample_status: "feedback_done", sample_return_status: "due", sample_return_requested_at: "2026-11-05T00:00:00Z" });
    expect([c.mine, c.done, c.stateKey]).toEqual([false, false, "state.sample.return_requested"]);
  });
  it("회수 완료·미회수 = 끝", () => {
    expect(at({ sample_status: "feedback_done", sample_return_status: "returned" }).filters).toEqual(["done"]);
    expect(at({ sample_status: "feedback_done", sample_return_status: "kept" }).stateKey).toBe("state.sample.kept");
  });
  it("그 외 상태 = 문장만, 할 일 아님", () => {
    for (const s of ["requested", "cn_shipped", "kr_arrived", "inspected", "sent_to_brand"]) {
      const c = at({ sample_status: s, sample_owner_role: "BRAND" });
      expect([c.mine, c.stateKey], s).toEqual([false, s === "requested" ? "state.sample.preparing" : `state.sample.${s}`]); // v2: requested = 출고 준비
    }
  });
  it("발주가 있어도 샘플 회수 할 일은 따로 한 장 (개발 DB adefb2cc 재현)", () => {
    const row = { ...smp, sample_status: "feedback_done", sample_return_status: "due", sample_return_due: "2026-11-18T00:00:00Z",
      order_id: "o1", order_status: "final_quoted", order_owner_role: "ADMIN", order_qty: 35 } as ProgressRow;
    const cs = progressCards(row);
    expect(cs.map((c) => [c.kind, c.mine])).toEqual([["order", false], ["sample", true]]);
    expect(filterCounts(cs)).toMatchObject({ mine: 1, sample: 1, order: 1 });
  });
  it("발주가 있고 샘플이 끝났으면 발주 카드만", () => {
    const row = { ...smp, sample_status: "feedback_done", sample_return_status: "returned", order_id: "o1", order_status: "confirmed", order_owner_role: "CN" } as ProgressRow;
    expect(progressCards(row).map((c) => c.kind)).toEqual(["order"]);
  });
  it("발주서 두 장 행에 같은 샘플이 반복돼도 샘플 카드는 한 장", () => {
    const row = { ...smp, sample_status: "delivered", order_id: "o1", order_status: "confirmed", order_owner_role: "CN" } as ProgressRow;
    const cs = cardsFromRows([row, { ...row, order_id: "o2" }]);
    expect(cs.map((c) => c.key)).toEqual(["o-o1-f1", "s-s1-f1", "o-o2-f1"]);
  });
});

describe("카드 이름 (T7)", () => {
  it("요청 이름 접두어를 뗀다", () => {
    expect(itemName("2차 점검 — 울 니트 가디건 (오버핏)", "2차 점검 요청")).toBe("울 니트 가디건 (오버핏)");
    expect(itemName("에코퍼 크롭 자켓", "에코퍼 F/W")).toBe("에코퍼 크롭 자켓");
    expect(itemName("코트 - 롱", "니트")).toBe("코트 - 롱");
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

describe("샘플 요청서 담김 → 홈 할 일 (7차 검증 H1)", () => {
  const picked = (id: string) => progressCard({ ...offer, offer_id: id, offer_status: "interested", offer_reaction: "interested" });
  it("관심 표시 뒤 샘플 전인 제안만 담김, 같은 제안은 한 번", () => {
    const a = picked("a");
    const hold = progressCard({ ...offer, offer_id: "h", offer_status: "hold", offer_reaction: "hold" });
    const smp = progressCard({ ...offer, offer_id: "s", offer_status: "interested", offer_reaction: "interested", sample_request_id: "s1", sample_status: "requested" });
    const gone = progressCard({ ...offer, offer_id: "d", offer_status: "declined" });
    expect(cartCards([a, hold, smp, gone, a]).map((c) => c.offerId)).toEqual(["a"]);
  });
  it("작성 주소는 진행 화면 담김 바와 같은 ?offers=<id,id>", () => {
    expect(cartHref([picked("a"), picked("b")])).toBe("/samples/new?offers=a,b");
  });
  it("할 일 건수 = 내 차례 + 담김 1건(몇 개 담겨도 1)", () => {
    const mine = progressCard(offer); // 새 제안 = 내 차례
    expect(todoCount([mine])).toBe(1);
    expect(todoCount([mine, picked("a"), picked("b")])).toBe(2);
    expect(todoCount([picked("a")])).toBe(1);
    expect(todoCount([progressCard(base)])).toBe(0);
  });
  it("문구 키", () => {
    for (const k of ["todo.cart.t", "todo.cart.s", "todo.cart.sMany", "todo.cart.a"]) expect(K[k], k).toBeTruthy();
    expect(K["todo.cart.s"].replace("{name}", "에코퍼 롱 코트").replace("{n}", "1")).toBe("에코퍼 롱 코트 1개 담김");
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

describe("카드 상태 한 줄 (4차 D1·D3, d-18) — 종류 수량 · 상태 · 날짜", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  const smp = { ...offer, offer_status: "interested", offer_reaction: "interested", sample_request_id: "s1", sample_owner_role: "ADMIN", sample_qty: 1 } as ProgressRow;
  it("샘플 결정 대기(내 차례, v2.7 S6) = 샘플 1장 · 받음 · 11월 18일까지 결정", () => {
    const c = progressCard({ ...smp, sample_status: "feedback_done", sample_return_status: "due", sample_return_due: "2026-11-18T03:00:00Z" });
    expect(cardSentence(c, now)).toBe("샘플 1장 · 받음 · 11월 18일까지 결정");
  });
  it("최종 금액 동의 뒤 = 발주 35장 · 확정 대기 · 11월 5일", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "final_quoted", order_owner_role: "ADMIN", order_qty: 35, order_due_at: "2026-11-05T03:00:00Z" });
    expect(cardSentence(c, now)).toBe("발주 35장 · 확정 대기 · 11월 5일");
    expect(K["state.order.final_agreed"]).toBe("확정 대기");
  });
  it("확정 = 발주 35장 · 출고 준비 중 · 11월 9일", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "confirmed", order_owner_role: "CN", order_qty: 35, order_due_at: "2026-11-09T03:00:00Z" });
    expect(cardSentence(c, now)).toBe("발주 35장 · 출고 준비 중 · 11월 9일");
  });
  it("같은 상품 샘플·발주 카드는 첫머리로 구분된다", () => {
    const row = { ...smp, sample_status: "feedback_done", sample_return_status: "due", order_id: "o1", order_status: "confirmed", order_owner_role: "CN", order_qty: 35 } as ProgressRow;
    const [o, s] = progressCards(row).map((c) => cardSentence(c, now));
    expect(o.startsWith("발주 35장 · ")).toBe(true);
    expect(s.startsWith("샘플 1장 · ")).toBe(true);
  });
  it("수량 1,000장은 천 단위 쉼표, 날짜 없으면 날짜 칸 없음", () => {
    const c = progressCard({ ...offer, order_id: "o1", order_status: "cn_shipped", order_owner_role: "CN", order_qty: 1000 });
    expect(cardSentence(c, now)).toBe("발주 1,000장 · 중국에서 보냄");
  });
  it("모든 샘플·발주 상태에 짧은 말이 있다(pcard.*)", () => {
    const ss = ["requested", "awaiting_payment", "payment_reported", "cn_shipped", "kr_arrived", "inspected", "sent_to_brand", "delivered", "feedback_done", "return_due", "return_requested", "returned", "kept", "closed", "cancelled"];
    const os = ["reserved", "stock_checking", "stock_confirmed", "partial_confirmed", "stock_short", "deposit_pending", "deposit_reported", "hold_confirmed", "quoting", "quoted", "qty_confirmed", "final_quoted", "final_agreed", "confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done", "cancelled"];
    for (const s of ss) expect(K[`pcard.sample.${s}`], s).toBeTruthy();
    for (const s of os) expect(K[`pcard.order.${s}`], s).toBeTruthy();
  });
  it("요청·제안 카드는 기존 문장 + 날짜", () => {
    expect(cardSentence(progressCard(base), now)).toBe("현장에서 찾는 중 · 11월 7일");
    expect(cardSentence(progressCard(offer), now)).toBe("새 제안이 도착했어요 · 11월 18일까지");
  });
});

describe("진행 묶음 순서 (4차 D2)", () => {
  const card = (requestId: string, mine: boolean, sortAt: string, key = `${requestId}-${sortAt}`) => ({ key, requestId, mine, sortAt });
  it("할 일 있는 묶음 → 최근 활동순, 추천은 맨 아래", () => {
    const cards = [
      card("new1", false, "2026-11-05"),          // 가장 최근 요청(카드 1장, 할 일 없음)
      card("old", false, "2026-11-01"), card("old", true, "2026-11-02"), // 할 일 있는 묶음
      card("mid", false, "2026-11-04"),
      card("__rec", true, "2026-11-06"),
    ];
    expect(groupCards(cards, "__rec").map((g) => g[0].requestId)).toEqual(["old", "new1", "mid", "__rec"]);
  });
  it("최근 활동 = 묶음 안 가장 늦은 시각(요청일 포함)", () => {
    const cards = [card("a", false, "2026-11-01"), card("a", false, "2026-11-09"), card("b", false, "2026-11-05")];
    expect(groupCards(cards).map((g) => g[0].requestId)).toEqual(["a", "b"]);
  });
  it("묶음 안은 sortCards 순서(할 일 먼저) 그대로", () => {
    const a = progressCard({ ...offer, offer_id: "a", offer_status: "interested", offer_reaction: "interested" });
    const b = progressCard({ ...offer, offer_id: "b" }); // 새 제안 = 할 일
    const g = groupCards(sortCards([a, b]));
    expect(g[0].map((c) => c.key)).toEqual(["f-b", "f-a"]);
  });
});

describe("할 일 버튼 주소 (4차 D4)", () => {
  it("상세 안 해당 블록 앵커", () => {
    const at = (p: Partial<ProgressRow>) => cardActionHref(progressCard({ ...offer, sample_request_id: "s1", ...p } as ProgressRow));
    expect(at({ sample_status: "feedback_done", sample_return_status: "due" })).toBe("/samples/s1#return");
    expect(at({ sample_status: "delivered" })).toBe("/samples/s1#feedback");
    expect(at({ sample_status: "awaiting_payment" })).toBe("/samples/s1#payment");
    const o = (s: string) => cardActionHref(progressCard({ ...offer, order_id: "o1", order_status: s, order_owner_role: "BRAND" }));
    expect([o("deposit_pending"), o("quoted"), o("final_quoted"), o("delivered"), o("sent_to_brand")])
      .toEqual(["/orders/o1#deposit", "/orders/o1#qty", "/orders/o1#approve", "/orders/o1#report", "/orders/o1"]);
    expect(cardActionHref(progressCard({ ...base, item_status: "needs_info" }))).toBe("/requests/r1#item-i1");
  });
});

describe("요청 상세 지금 블록 (4차 D8) · 도메인 칩 (D7·D9)", () => {
  it("이름 = 첫 쉼표 앞 8자", () => {
    expect(nowName("롱 코트, 울")).toBe("롱 코트");
    expect(nowName("와이드 슬랙스")).toBe("와이드 슬랙스");
    expect(nowName("인스타 느낌의 크롭 블루종")).toBe("인스타 느낌의…");
  });
  it("단계별 묶음 = 처음 나온 순서 · 개수", () => {
    expect(countInOrder(["찾는 중", "확인 중", "확인 중"])).toEqual([["찾는 중", 1], ["확인 중", 2]]);
  });
  it("링크 → 도메인", () => {
    expect(linkDomain("https://www.instagram.com/p/xxxx")).toBe("instagram.com");
    expect(linkDomain("https://item.taobao.com/item.htm?id=1")).toBe("item.taobao.com");
    expect(linkDomain("https://m.musinsa.com/a")).toBe("musinsa.com");
    expect(linkDomain("instagram.com/p")).toBeNull();
    expect(linkDomain(null)).toBeNull();
  });
});

describe("제안 상세 행동 블록 (7차 검증 O1)", () => {
  const sr = (o: Partial<OfferSampleRow>): OfferSampleRow => ({
    id: "s1", status: "requested", created_at: "2026-11-01T00:00:00Z", due_at: "2026-11-08T00:00:00Z", delivered_at: null,
    payment_reported_at: null, payment_confirmed_at: null, items: [{ return_status: null, return_requested_at: null }], ...o,
  });
  it("샘플·발주 없음 = null(담김 전/담김)", () => expect(offerProgress([], [])).toBeNull());
  it("샘플 받은 뒤 = 받음 + 받은 날, 받기 전 = 상태 문장(내 차례면 기한)", () => {
    expect(offerProgress([sr({ status: "feedback_done", delivered_at: "2026-11-04T03:00:00Z", items: [{ return_status: "returned", return_requested_at: null }] })], []))
      .toMatchObject({ kind: "sample", received: true, receivedAt: "2026-11-04T03:00:00Z", due: null });
    expect(offerProgress([sr({ status: "awaiting_payment" })], [])).toMatchObject({ kind: "sample", received: false, stateKey: "state.sample.awaiting_payment", due: "2026-11-08T00:00:00Z" });
    expect(offerProgress([sr({})], [])).toMatchObject({ stateKey: "state.sample.preparing", due: null }); // v2(d-26): requested = 출고 준비
  });
  it("취소된 샘플은 건너뛰고, 발주가 있으면 발주(최근 1건 · 수량)", () => {
    expect(offerProgress([sr({ status: "cancelled" })], [])).toBeNull();
    const r = offerProgress([sr({ status: "delivered" })], [
      { id: "o-old", status: "cancelled", created_at: "2026-11-05T00:00:00Z", qty: 10 },
      { id: "o1", status: "quoted", created_at: "2026-11-04T00:00:00Z", qty: 35 },
    ]);
    expect(r).toEqual({ kind: "order", id: "o1", qty: 35, done: false });
    expect(offerProgress([], [{ id: "o2", status: "report_done", created_at: "2026-11-04T00:00:00Z", qty: 35 }])).toMatchObject({ done: true });
  });
  it("문구 키", () => {
    for (const k of ["offer.detail.fact.sampleReceived", "offer.detail.fact.order", "offer.detail.fact.orderDone", "offer.detail.viewSample", "offer.detail.viewOrder"]) expect(K[k], k).toBeTruthy();
    expect(K["offer.detail.fact.order"].replace("{n}", "35")).toBe("발주 35장 진행 중");
  });
});

describe("샘플 입금 신고·확인 뒤 문장 (7차 검증 W1·W4)", () => {
  const offer = { ...base, offer_id: "o1", product_id: "p1", offer_status: "interested", sample_request_id: "s1", sample_qty: 1, sample_owner_role: "CN", sample_due_at: "2026-11-08T00:00:00Z" };
  it("입금 신고 뒤 카드는 날짜 없이 '입금 확인 중'", () => {
    const c = progressCard({ ...offer, sample_status: "awaiting_payment", sample_payment_reported_at: "2026-11-05T00:00:00Z" });
    expect(c.stateKey).toBe("state.sample.payment_reported");
    expect(cardSentence(c)).toBe("샘플 1장 · 입금 확인 중");
  });
  it("입금 확인 뒤(requested) 카드는 '출고 준비 중', 날짜 없음", () => {
    const c = progressCard({ ...offer, sample_status: "requested", sample_payment_reported_at: "2026-11-05T00:00:00Z" });
    expect(c.stateKey).toBe("state.sample.preparing");
    expect(cardSentence(c)).toBe("샘플 1장 · 출고 준비 중");
  });
  it("v2(d-26): 입금 단계가 없어 requested는 바로 '출고 준비 중'", () => {
    expect(progressCard({ ...offer, sample_status: "requested" }).stateKey).toBe("state.sample.preparing");
  });
  it("상세 문구 키", () => {
    const K = ko as Record<string, string>;
    expect(K["state.sample.preparing"]).toBe("중국에서 출고를 준비하고 있어요");
    expect(K["state.sample.paymentReportedSub"]).toBe("위아더가 입금을 확인하고 있어요 · 보통 1영업일 안에");
  });
});
