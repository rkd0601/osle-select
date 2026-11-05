/**
 * 진행 카드 계산 (디자인 v2.2 · DECISIONS d-7·d-9·d-11) — 순수 함수.
 * 입력 = v_progress_brand 한 행(또는 같은 모양으로 합친 대체 행). 출력 = 사진 카드 한 장: 종류·단계(1~5)·내 차례·기한·상태 문장 키·이동 주소·필터 칸.
 * 문장은 브랜드용 사람 말 키(`state.<kind>.<상태>`, ko.json). 화면은 키를 tk로 바꾸고 날짜는 fmtDay("11월 18일")로 넣는다.
 * 서버 권한·전이와 무관(표시 전용) — 상태 전이는 여전히 서버 액션이 결정한다.
 */
import { sampleStateKey } from "./brand-state";
import { tk } from "./i18n";
import { fmtDay, krw } from "./format";

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
  /** 회수 신청 시각(0055 뷰부터. 없으면 신청 전으로 본다) */
  sample_return_requested_at?: string | null;
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
  qty: number | null;          // 상태 문장 앞 수량(샘플·발주 "샘플 1장 · …", d-18)
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
  // 샘플이 있으면 샘플 카드 (발주 카드와 별개 — 아래 progressCards)
  if (r.sample_request_id && r.sample_status) return sampleCard(r, base);
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

/**
 * 샘플 카드. 내 차례는 owner_role이 아니라 상태로 정한다(lib/handoff.ts 브랜드 차례와 같은 규칙):
 * awaiting_payment(입금 신고 전) → 입금 · delivered → 피드백 · feedback_done + 회수 대기(신청 전) → 회수 선택. 그 외는 상태 문장만.
 */
function sampleCard(r: ProgressRow, base: Pick<ProgressCard, "offerId" | "productId" | "requestId" | "requestItemId">): ProgressCard {
  const s = r.sample_status!;
  const stateKey = sampleStateKey(
    { status: s, payment_reported_at: r.sample_payment_reported_at },
    [{ return_status: r.sample_return_status, return_requested_at: r.sample_return_requested_at ?? null }],
  );
  const mine = stateKey === "state.sample.awaiting_payment" || stateKey === "state.sample.delivered" || stateKey === "state.sample.return_due";
  const due = s === "delivered" ? r.sample_feedback_due : stateKey === "state.sample.return_due" ? r.sample_return_due : r.sample_due_at;
  const done = s === "closed" || stateKey === "state.sample.returned" || stateKey === "state.sample.kept";
  // 입금 확인 중(위아더 몫)·출고 준비 중(보통 7~10일)에는 날짜가 뜻이 없다 — "샘플 1장 · 출고 준비 중"(7차 검증 W1·W4)
  const noDate = stateKey === "state.sample.payment_reported" || stateKey === "state.sample.preparing";
  return {
    ...base, key: `s-${r.sample_request_id}-${r.offer_id}`, kind: "sample", stage: 3, mine, isNew: false, done,
    due: done || noDate ? null : due, stateKey, href: `/samples/${r.sample_request_id}`, filters: [...(mine ? (["mine"] as const) : []), done ? "done" : "sample"],
    qty: r.sample_qty, sortAt: r.offer_issued_at ?? r.request_created_at,
  };
}

/**
 * 한 행 → 카드 여러 장. 발주가 있어도 샘플이 아직 끝나지 않았으면(입금·피드백·회수 대기 등) 샘플 카드를 따로 낸다 —
 * 회수 할 일이 발주 카드 뒤에 숨지 않게(3차 검증 C1). 같은 샘플이 발주서 여러 장의 행에 반복되면 호출부가 key로 한 번만 쓴다.
 */
export function progressCards(r: ProgressRow): ProgressCard[] {
  const first = progressCard(r);
  if (first.kind !== "order" || !r.sample_request_id || !r.sample_status) return [first];
  const base = { offerId: r.offer_id, productId: r.product_id, requestId: r.request_id, requestItemId: r.request_item_id };
  const smp = sampleCard(r, base);
  return smp.done ? [first] : [first, smp];
}

/** 행들 → 카드(키 중복 제거). 정렬은 sortCards */
export function cardsFromRows(rows: ProgressRow[]): ProgressCard[] {
  const seen = new Set<string>();
  const out: ProgressCard[] = [];
  for (const r of rows) for (const c of progressCards(r)) if (!seen.has(c.key)) { seen.add(c.key); out.push(c); }
  return out;
}

/** 할 일 먼저, 그다음 기한 가까운 순, 그다음 최근 순 */
export function sortCards(cards: ProgressCard[]): ProgressCard[] {
  return [...cards].sort((a, b) =>
    Number(b.mine) - Number(a.mine) || Number(a.done) - Number(b.done) ||
    (a.mine && b.mine ? (a.due ?? "9").localeCompare(b.due ?? "9") : 0) || b.sortAt.localeCompare(a.sortAt));
}

/**
 * 진행 묶음 순서 (4차 검증 D2, DECISIONS d-18): 할 일 있는 묶음 → 최근 활동순(묶음 안 카드의 가장 늦은 sortAt·요청일).
 * 묶음 안 순서는 들어온 카드 순서 그대로(sortCards = 할 일 먼저). 추천 묶음(recommendId)은 항상 맨 아래(d-15).
 */
export function groupCards<C extends Pick<ProgressCard, "requestId" | "mine" | "sortAt">>(cards: C[], recommendId?: string, createdAt?: (c: C) => string): C[][] {
  const groups = new Map<string, C[]>();
  for (const c of cards) (groups.get(c.requestId) ?? groups.set(c.requestId, []).get(c.requestId)!).push(c);
  const last = (g: C[]) => g.flatMap((c) => [c.sortAt, createdAt?.(c) ?? ""]).sort().at(-1) ?? "";
  return [...groups.values()].sort((a, b) =>
    Number(a[0].requestId === recommendId) - Number(b[0].requestId === recommendId) ||
    Number(b.some((c) => c.mine)) - Number(a.some((c) => c.mine)) ||
    last(b).localeCompare(last(a)));
}

/**
 * 카드 상태 한 줄 (4차 검증 D1·D3, d-18) — "종류 수량 · 상태 · 날짜".
 * 샘플·발주: "샘플 1장 · 11월 18일까지 돌려보내기"(내 차례 = 날짜 + 동사) / "발주 35장 · 확정 대기 · 11월 5일"(그 외).
 * 같은 상품의 샘플·발주 카드가 문장 첫머리로 구분된다. 짧은 상태 말은 `pcard.<kind>.<상태>`(없으면 `state.*` 전문).
 * 요청·제안 카드는 기존 문장 + 날짜. 화면은 한 줄 말줄임(`title`에 전문).
 */
export function cardSentence(c: Pick<ProgressCard, "kind" | "stateKey" | "due" | "mine" | "qty">, now?: Date): string {
  const day = c.due ? fmtDay(c.due, now) : null;
  if (c.kind === "sample" || c.kind === "order") {
    const kind = c.qty ? tk(`pcard.kind.${c.kind}`, { n: krw(c.qty) }) : tk(`pcard.kind.${c.kind}NoQty`);
    const shortKey = c.stateKey.replace(/^state\./, "pcard.");
    const short = tk(shortKey) === shortKey ? tk(c.stateKey) : tk(shortKey);
    if (c.mine && day) return `${kind} · ${tk("pcard.until", { date: day, act: short })}`;
    return [kind, short, day].filter(Boolean).join(" · ");
  }
  const s = tk(c.stateKey);
  return day ? `${s} · ${tk(c.mine ? "state.until" : "state.on", { date: day })}` : s;
}

/**
 * 할 일 버튼이 가는 곳 (4차 검증 D4): 카드 전체는 상세(c.href), 버튼은 상세 안 해당 블록(id 앵커).
 * 앵커가 없는 할 일(제안 확인·수령 확인 — 상세 머리에 버튼이 있다)은 상세 그대로.
 */
const ACTION_ANCHOR: Record<string, string> = {
  "state.sample.awaiting_payment": "payment", "state.sample.delivered": "feedback", "state.sample.return_due": "return",
  "state.order.deposit_pending": "deposit", "state.order.quoted": "qty", "state.order.final_quoted": "approve", "state.order.delivered": "report",
};
export function cardActionHref(c: Pick<ProgressCard, "href" | "stateKey" | "requestItemId">): string {
  if (c.stateKey === "state.request.needs_info") return `${c.href}#item-${c.requestItemId}`;
  const a = ACTION_ANCHOR[c.stateKey];
  return a ? `${c.href}#${a}` : c.href;
}

/**
 * 샘플 요청서 담김 (7차 검증 H1): 관심 표시했고 아직 샘플 요청서가 없는 제안 = 진행 화면 아래 담김 바와 홈 할 일이 같은 기준.
 * 샘플 요청서가 생기면 그 제안 카드는 샘플 카드로 바뀌므로 여기서 빠진다.
 */
export function cartCards<C extends Pick<ProgressCard, "kind" | "done" | "stateKey" | "offerId">>(cards: C[]): C[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (c.kind !== "offer" || c.done || c.stateKey !== "state.offer.interested" || !c.offerId || seen.has(c.offerId)) return false;
    seen.add(c.offerId);
    return true;
  });
}

/** 담긴 제안으로 샘플 요청서 작성 주소(/b/{slug} 뒤) — ?offers=<id,id> */
export function cartHref(cart: Pick<ProgressCard, "offerId">[]): string {
  return `/samples/new?offers=${cart.map((c) => c.offerId).join(",")}`;
}

/** 홈 할 일 건수 = 내 차례 카드 + 샘플 요청서 담김(몇 개든 할 일 1건으로 묶는다, H1) */
export function todoCount(cards: Pick<ProgressCard, "mine" | "kind" | "done" | "stateKey" | "offerId">[]): number {
  return cards.filter((c) => c.mine).length + (cartCards(cards).length ? 1 : 0);
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

/**
 * 카드 이름: 항목 설명에 요청 이름이 접두어로 붙어 있으면 뗀다("2차 점검 — 울 니트 가디건" → "울 니트 가디건", 3차 검증 T7).
 * 요청 이름은 진행 묶음 머리에 이미 있다.
 */
export function itemName(description: string | null, requestTitle: string | null): string {
  const d = (description ?? "").trim();
  const m = d.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (m && requestTitle && requestTitle.trim().startsWith(m[1].trim())) return m[2].trim();
  return d;
}
