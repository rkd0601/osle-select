/**
 * 진행 카드 계산 (디자인 v2.2 · DECISIONS d-7·d-9·d-11) — 순수 함수.
 * 입력 = v_progress_brand 한 행(또는 같은 모양으로 합친 대체 행). 출력 = 사진 카드 한 장: 종류·단계(1~5)·내 차례·기한·상태 문장 키·이동 주소·필터 칸.
 * 문장은 브랜드용 사람 말 키(`state.<kind>.<상태>`, ko.json). 화면은 키를 tk로 바꾸고 날짜는 fmtDay("11월 18일")로 넣는다.
 * 서버 권한·전이와 무관(표시 전용) — 상태 전이는 여전히 서버 액션이 결정한다.
 */
export type ProgressRow = {
  request_item_id: string; request_id: string; brand_id: string;
  request_title: string | null; request_created_at: string;
  item_seq: number; item_description: string | null; item_category: string | null;
  item_status: string; item_owner_role: string | null; item_due_at: string | null;
  offer_id: string | null; product_id: string | null; offer_status: string | null; offer_reaction: string | null;
  price_tiers: { min_qty: number; product_price_krw: number }[] | null; fee_rate: number | null;
  exclusive_until: string | null; valid_until: string | null; offer_issued_at: string | null;
  sample_request_id: string | null; sample_status: string | null; sample_owner_role: string | null; sample_due_at: string | null;
  sample_qty: number | null; sample_feedback: string | null; sample_return_status: string | null;
  sample_feedback_due: string | null; sample_return_due: string | null; sample_payment_reported_at: string | null;
  order_id: string | null; order_status: string | null; order_owner_role: string | null; order_due_at: string | null;
  order_qty: number | null; order_deposit_reported_at: string | null; order_report_due: string | null; order_created_at: string | null;
};

export type ProgressKind = "request" | "offer" | "sample" | "order";
export type ProgressFilter = "mine" | "offer" | "sample" | "order" | "done";

export type ProgressCard = {
  key: string;                 // 카드 고유 키
  kind: ProgressKind;
  stage: 1 | 2 | 3 | 4 | 5;    // 1 요청 · 2 제안 · 3 샘플 · 4 발주 · 5 끝
  mine: boolean;               // 브랜드가 할 일(사진 위 '할 일' 라벨)
  isNew: boolean;              // 반응 전 제안(사진 위 '새 제안' 라벨)
  done: boolean;
  due: string | null;          // 문장에 넣을 날짜
  stateKey: string;            // ko.json `state.*`
  href: string;                // 상세 주소(/b/{slug} 뒤)
  filters: ProgressFilter[];
  qty: number | null;          // 이름 옆 수량(샘플·발주)
  offerId: string | null; productId: string | null;
  requestId: string; requestItemId: string;
  sortAt: string;              // 최근 순 정렬
};

const DONE_ITEM = new Set(["closed", "cancelled"]);
const DONE_OFFER = new Set(["declined", "expired"]);

export function progressCard(r: ProgressRow): ProgressCard {
  const base = { offerId: r.offer_id, productId: r.product_id, requestId: r.request_id, requestItemId: r.request_item_id };
  // 발주가 있으면 발주 카드(발주서마다 한 장)
  if (r.order_id && r.order_status) {
    const s = r.order_status;
    const done = s === "report_done";
    const reported = s === "deposit_pending" && !!r.order_deposit_reported_at;
    const mine = !done && !reported && r.order_owner_role === "BRAND";
    const due = s === "delivered" ? r.order_report_due : r.order_due_at;
    return {
      ...base, key: `o-${r.order_id}-${r.offer_id}`, kind: "order", stage: done || s === "delivered" ? 5 : 4, mine, isNew: false, done,
      due: mine || !done ? due : null,
      // 최종 견적에 동의한 뒤(u-10: 위아더 차례로 넘어감)는 "확인해 주세요"가 아니라 "동의함 · 확정 대기"
      stateKey: reported ? "state.order.deposit_reported" : s === "final_quoted" && r.order_owner_role !== "BRAND" ? "state.order.final_agreed" : `state.order.${s}`,
      href: `/orders/${r.order_id}`, filters: [...(mine ? (["mine"] as const) : []), done ? "done" : "order"], qty: r.order_qty,
      sortAt: r.order_created_at ?? r.request_created_at,
    };
  }
  // 샘플이 있으면 샘플 카드
  if (r.sample_request_id && r.sample_status) {
    const s = r.sample_status;
    const paid = s === "awaiting_payment" && !!r.sample_payment_reported_at;
    let stateKey = `state.sample.${s}`;
    let due = r.sample_due_at;
    let mine = !paid && r.sample_owner_role === "BRAND";
    if (paid) stateKey = "state.sample.payment_reported";
    if (s === "delivered") due = r.sample_feedback_due;
    if (s === "feedback_done") {
      const ret = r.sample_return_status;
      if (ret === "due") { stateKey = "state.sample.return_due"; due = r.sample_return_due; mine = true; }
      else { stateKey = ret === "kept" ? "state.sample.kept" : "state.sample.returned"; mine = false; }
    }
    const done = s === "closed" || (s === "feedback_done" && r.sample_return_status !== "due");
    return {
      ...base, key: `s-${r.sample_request_id}-${r.offer_id}`, kind: "sample", stage: 3, mine, isNew: false, done,
      due, stateKey, href: `/samples/${r.sample_request_id}`, filters: [...(mine ? (["mine"] as const) : []), done ? "done" : "sample"],
      qty: r.sample_qty, sortAt: r.offer_issued_at ?? r.request_created_at,
    };
  }
  // 제안
  if (r.offer_id && r.offer_status) {
    const s = r.offer_status;
    const done = DONE_OFFER.has(s);
    const isNew = s === "new";
    const mine = isNew || s === "reconsent_pending";
    const stateKey = s === "new" ? "state.offer.new" : s === "reconsent_pending" ? "state.offer.reconsent" : done ? `state.offer.${s}`
      : r.offer_reaction === "interested" ? "state.offer.interested" : r.offer_reaction === "hold" ? "state.offer.hold" : "state.offer.new";
    return {
      ...base, key: `f-${r.offer_id}`, kind: "offer", stage: done ? 5 : 2, mine, isNew, done,
      due: done ? null : r.exclusive_until ?? r.valid_until, stateKey, href: `/offers/${r.offer_id}`,
      filters: [...(mine ? (["mine"] as const) : []), done ? "done" : "offer"], qty: null, sortAt: r.offer_issued_at ?? r.request_created_at,
    };
  }
  // 요청 항목만
  const s = r.item_status;
  const done = DONE_ITEM.has(s);
  const mine = s === "needs_info";
  return {
    ...base, key: `r-${r.request_item_id}`, kind: "request", stage: done ? 5 : 1, mine, isNew: false, done,
    due: mine ? r.item_due_at : s === "sourcing" || s === "assigned" ? r.item_due_at : null,
    stateKey: `state.request.${s}`, href: `/requests/${r.request_id}`, filters: [...(mine ? (["mine"] as const) : []), ...(done ? (["done"] as const) : [])],
    qty: null, sortAt: r.request_created_at,
  };
}

/** 할 일 먼저, 그다음 기한 가까운 순, 그다음 최근 순 */
export function sortCards(cards: ProgressCard[]): ProgressCard[] {
  return [...cards].sort((a, b) =>
    Number(b.mine) - Number(a.mine) || Number(a.done) - Number(b.done) ||
    (a.mine && b.mine ? (a.due ?? "9").localeCompare(b.due ?? "9") : 0) || b.sortAt.localeCompare(a.sortAt));
}

export function filterCounts(cards: ProgressCard[]): Record<ProgressFilter | "all", number> {
  const c = { all: cards.length, mine: 0, offer: 0, sample: 0, order: 0, done: 0 };
  for (const x of cards) for (const f of x.filters) c[f]++;
  return c;
}

/** 수수료 포함 최소 공급가(가장 큰 구간 = 가장 싼 단가는 표시하지 않고, 첫 구간 = "n장부터") */
export function firstTier(tiers: ProgressRow["price_tiers"]): { min_qty: number; product_price_krw: number } | null {
  if (!tiers?.length) return null;
  return [...tiers].sort((a, b) => a.min_qty - b.min_qty)[0];
}
