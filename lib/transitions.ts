/**
 * 객체별 상태 전이 테이블. PRD 4장.
 * 모든 상태 변경은 Server Action → assertTransition() 을 거친다. 클라이언트는 허용 버튼만 렌더한다.
 */
import type { Role } from "./config";

export const REQUEST_ITEM_STATUS = [
  "received", "needs_info", "assigned", "sourcing", "offered", "selected", "closed", "on_hold", "cancelled",
] as const;
export const PRODUCT_STATUS = [
  "draft", "pending_review", "reviewed", "offering", "repool", "rejected", "recheck", "hidden",
] as const;
export const OFFER_STATUS = ["new", "interested", "hold", "declined", "recheck", "reconsent_pending", "expired"] as const;
export const SAMPLE_REQUEST_STATUS = [
  "requested", "awaiting_payment", "cn_shipped", "kr_arrived", "inspected", "sent_to_brand", "delivered", "feedback_done", "closed", "cancelled",
] as const;
export const ORDER_STATUS = [
  "reserved", "stock_checking", "stock_confirmed", "partial_confirmed", "stock_short", "deposit_pending", "hold_confirmed",
  "quoting", "quoted", "qty_confirmed", "final_quoted", "confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done", "cancelled",
] as const;

export type Entity = "request_item" | "product" | "offer" | "sample_request" | "order";
type Rule = { to: string; by: Role[]; purchase?: boolean };
type Table = Record<string, Rule[]>;

const ADMIN: Role[] = ["ADMIN"];
const CN: Role[] = ["ADMIN", "CN_SOURCER", "CN_VENDOR"];
const BRAND: Role[] = ["ADMIN", "BRAND_OWNER", "BRAND_MEMBER"];
/** 구매 권한이 필요한 전이. 역할이 아니라 brand_members(level owner 또는 can_purchase)로 판단한다 → Actor.canPurchase */
const BRAND_PURCHASE: Role[] = ["ADMIN", "BRAND_OWNER", "BRAND_MEMBER"];

const requestItem: Table = {
  received: [{ to: "needs_info", by: ADMIN }, { to: "assigned", by: ADMIN }, { to: "on_hold", by: ADMIN }, { to: "cancelled", by: BRAND }],
  needs_info: [{ to: "received", by: BRAND }, { to: "assigned", by: ADMIN }, { to: "cancelled", by: BRAND }],
  assigned: [{ to: "sourcing", by: CN }, { to: "offered", by: ADMIN }, { to: "received", by: ADMIN }, { to: "on_hold", by: ADMIN }],
  sourcing: [{ to: "offered", by: ADMIN }, { to: "on_hold", by: ADMIN }, { to: "cancelled", by: BRAND }],
  offered: [{ to: "selected", by: ADMIN }, { to: "sourcing", by: ADMIN }, { to: "closed", by: ADMIN }],
  selected: [{ to: "closed", by: ADMIN }, { to: "sourcing", by: ADMIN }],
  on_hold: [{ to: "assigned", by: ADMIN }, { to: "cancelled", by: BRAND }],
  closed: [],
  cancelled: [],
};

const product: Table = {
  draft: [{ to: "pending_review", by: CN }],
  pending_review: [{ to: "reviewed", by: ADMIN }, { to: "rejected", by: ADMIN }],
  rejected: [{ to: "pending_review", by: CN }, { to: "hidden", by: ADMIN }],
  reviewed: [{ to: "offering", by: ADMIN }, { to: "recheck", by: CN }, { to: "hidden", by: ADMIN }],
  offering: [{ to: "repool", by: ADMIN }, { to: "recheck", by: CN }, { to: "hidden", by: ADMIN }],
  repool: [{ to: "offering", by: ADMIN }, { to: "hidden", by: ADMIN }, { to: "recheck", by: CN }],
  recheck: [{ to: "reviewed", by: ADMIN }, { to: "offering", by: ADMIN }, { to: "hidden", by: ADMIN }],
  hidden: [{ to: "pending_review", by: ADMIN }],
};

const offer: Table = {
  new: [{ to: "interested", by: BRAND }, { to: "hold", by: BRAND }, { to: "declined", by: BRAND }, { to: "recheck", by: ADMIN }, { to: "expired", by: ADMIN }],
  interested: [{ to: "hold", by: BRAND }, { to: "declined", by: BRAND }, { to: "recheck", by: ADMIN }, { to: "expired", by: ADMIN }],
  hold: [{ to: "interested", by: BRAND }, { to: "declined", by: BRAND }, { to: "recheck", by: ADMIN }, { to: "expired", by: ADMIN }],
  declined: [{ to: "interested", by: BRAND }],
  recheck: [{ to: "reconsent_pending", by: ADMIN }, { to: "interested", by: ADMIN }, { to: "hold", by: ADMIN }, { to: "new", by: ADMIN }, { to: "expired", by: ADMIN }],
  reconsent_pending: [{ to: "interested", by: BRAND_PURCHASE, purchase: true }, { to: "declined", by: BRAND }, { to: "expired", by: ADMIN }],
  expired: [],
};

const sampleRequest: Table = {
  requested: [{ to: "awaiting_payment", by: ADMIN }, { to: "cn_shipped", by: CN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }],
  // 입금 확인(ADMIN) → requested(= CN 출고 준비, 기획 결정의 cn_preparing). 출고는 requested에서만 — 결제 게이트가 상태로 드러난다
  awaiting_payment: [{ to: "requested", by: ADMIN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }, { to: "cancelled", by: ADMIN }],
  cn_shipped: [{ to: "kr_arrived", by: ADMIN }],
  kr_arrived: [{ to: "inspected", by: ADMIN }],
  inspected: [{ to: "sent_to_brand", by: ADMIN }],
  sent_to_brand: [{ to: "delivered", by: ADMIN }, { to: "delivered", by: BRAND }],
  delivered: [{ to: "feedback_done", by: BRAND }],
  feedback_done: [{ to: "closed", by: ADMIN }],
  closed: [],
  cancelled: [],
};

const order: Table = {
  reserved: [{ to: "stock_checking", by: ADMIN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }],
  stock_checking: [{ to: "stock_confirmed", by: CN }, { to: "partial_confirmed", by: CN }, { to: "stock_short", by: CN }],
  stock_short: [{ to: "stock_checking", by: ADMIN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }, { to: "cancelled", by: ADMIN }],
  stock_confirmed: [{ to: "deposit_pending", by: ADMIN }, { to: "quoting", by: ADMIN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }],
  partial_confirmed: [{ to: "deposit_pending", by: ADMIN }, { to: "quoting", by: ADMIN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }],
  deposit_pending: [{ to: "hold_confirmed", by: ADMIN }, { to: "cancelled", by: ADMIN }],
  hold_confirmed: [{ to: "quoting", by: ADMIN }],
  quoting: [{ to: "quoted", by: ADMIN }],
  quoted: [{ to: "qty_confirmed", by: BRAND_PURCHASE, purchase: true }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }],
  qty_confirmed: [{ to: "final_quoted", by: ADMIN }, { to: "quoted", by: ADMIN }],
  final_quoted: [{ to: "confirmed", by: ADMIN }, { to: "qty_confirmed", by: ADMIN }],
  // 확정 후 수량 수정(1회)은 차감·크레딧 되돌림 로직이 생길 때 간선을 다시 연다 — 지금 되돌리면 이미 쓴 크레딧·차감이 꼬인다 (7단계 리뷰 10)
  confirmed: [{ to: "cn_shipped", by: CN }],
  cn_shipped: [{ to: "kr_inspecting", by: ADMIN }, { to: "sent_to_brand", by: ADMIN }], // 직송(route=direct)이면 검품 건너뜀
  kr_inspecting: [{ to: "sent_to_brand", by: ADMIN }],
  sent_to_brand: [{ to: "delivered", by: ADMIN }, { to: "delivered", by: BRAND }],
  delivered: [{ to: "report_done", by: BRAND }, { to: "report_done", by: ADMIN }],
  report_done: [],
  cancelled: [],
};

/**
 * 항목·라인 단위 필드 전이 (DECISIONS r4 #9). status 컬럼이 아닌 필드라 SLA(owner_role·due_at)는 없다 —
 * lib/db/transition.ts#applyFieldTransition이 같은 낙관적 잠금·감사 로그로 강제한다.
 */
export type FieldEntity = "sample_item" | "sample_item_return" | "sample_item_charge" | "order_line_stock" | "order_line_backorder";
export const SAMPLE_ITEM_STATUS = ["pending", "ok", "defect", "unavailable"] as const;
export const SAMPLE_ITEM_RETURN = ["due", "returned", "kept"] as const;
export const SAMPLE_ITEM_CHARGE = ["none", "charged", "deducted"] as const;
export const ORDER_LINE_STOCK = ["pending", "confirmed", "short"] as const;
export const ORDER_LINE_BACKORDER = ["none", "backordered", "resolved"] as const;

/** 검품(A-05): 위아더만. 도착(kr_arrived) 동안 정정 가능 */
const sampleItem: Table = {
  pending: [{ to: "ok", by: ADMIN }, { to: "defect", by: ADMIN }, { to: "unavailable", by: ADMIN }],
  ok: [{ to: "defect", by: ADMIN }, { to: "unavailable", by: ADMIN }],
  defect: [{ to: "ok", by: ADMIN }, { to: "unavailable", by: ADMIN }],
  unavailable: [{ to: "ok", by: ADMIN }, { to: "defect", by: ADMIN }],
};
/** 회수: 보유는 구매 행위(canPurchase), 반납으로 마음을 바꾸는 건 누구나. 반납 접수는 위아더 */
const sampleItemReturn: Table = {
  due: [{ to: "returned", by: ADMIN }, { to: "kept", by: BRAND_PURCHASE, purchase: true }],
  kept: [{ to: "due", by: BRAND }, { to: "returned", by: ADMIN }],
  returned: [],
};
/** 미회수 청구(관리자 확정) → 같은 상품 발주 확정 때 1회 차감 */
const sampleItemCharge: Table = {
  none: [{ to: "charged", by: ADMIN }],
  charged: [{ to: "deducted", by: ADMIN }],
  deducted: [],
};
/** 재고 응답(C-05): CN이 확보/부족, 재고 확인 중 정정 가능. 부족 라인 재확인 요청은 위아더 */
const orderLineStock: Table = {
  pending: [{ to: "confirmed", by: CN }, { to: "short", by: CN }],
  confirmed: [{ to: "short", by: CN }],
  short: [{ to: "confirmed", by: CN }, { to: "pending", by: ADMIN }],
};
/** 미송: 위아더가 원청과 직접 관리 (갱신은 같은 상태로 기록) */
const orderLineBackorder: Table = {
  none: [{ to: "backordered", by: ADMIN }],
  backordered: [{ to: "backordered", by: ADMIN }, { to: "resolved", by: ADMIN }],
  resolved: [{ to: "backordered", by: ADMIN }],
};

const TABLES: Record<Entity | FieldEntity, Table> = {
  request_item: requestItem, product, offer, sample_request: sampleRequest, order,
  sample_item: sampleItem, sample_item_return: sampleItemReturn, sample_item_charge: sampleItemCharge,
  order_line_stock: orderLineStock, order_line_backorder: orderLineBackorder,
};

/**
 * 행위자. role은 JWT(app_metadata.role), canPurchase는 해당 브랜드의 brand_members(level owner 또는 can_purchase)에서
 * 서버 액션이 조회해 넣는다. 문자열 role만 넘기면 canPurchase=false로 취급(구매 전이 불가).
 */
export type Actor = { role: Role; canPurchase?: boolean };
const toActor = (a: Actor | Role): Actor => (typeof a === "string" ? { role: a } : a);

export class TransitionError extends Error {
  constructor(public entity: Entity | FieldEntity, public from: string, public to: string, public role: Role) {
    super(`Transition not allowed: ${entity} ${from} → ${to} by ${role}`);
  }
}

function ruleAllows(r: Rule, actor: Actor): boolean {
  if (!r.by.includes(actor.role)) return false;
  if (r.purchase && actor.role !== "ADMIN" && !actor.canPurchase) return false;
  return true;
}

export function canTransition(entity: Entity | FieldEntity, from: string, to: string, actor: Actor | Role): boolean {
  const rules = TABLES[entity][from];
  if (!rules) return false;
  const a = toActor(actor);
  return rules.some((r) => r.to === to && ruleAllows(r, a));
}

export function assertTransition(entity: Entity | FieldEntity, from: string, to: string, actor: Actor | Role): void {
  if (!canTransition(entity, from, to, actor)) throw new TransitionError(entity, from, to, toActor(actor).role);
}

export function allowedNext(entity: Entity | FieldEntity, from: string, actor: Actor | Role): string[] {
  const a = toActor(actor);
  return (TABLES[entity][from] ?? []).filter((r) => ruleAllows(r, a)).map((r) => r.to);
}

/** 발주서 담기 조건 (PRD D8·4장): 제안 관심 AND 샘플 피드백 관심. 예외: 리오더 또는 관리자 면제 */
export function canAddToOrder(args: {
  offer_reaction: string;
  sample_feedback: "interested" | "hold" | "declined" | null;
  has_reorder_history: boolean;
  admin_waived: boolean;
}): boolean {
  if (args.admin_waived) return true;
  if (args.offer_reaction !== "interested") return false;
  if (args.has_reorder_history) return true;
  return args.sample_feedback === "interested";
}

/**
 * 공개 조건 (PRD 4장 + 기획서 §10 F3). 하나라도 빠지면 검수 요청·발행 불가.
 * photo_count는 참고용(reference) 사진을 뺀 수, has_real_photo는 자체 촬영 실물컷 여부.
 * 생산·혼합 공급이면 리드타임·생산 MOQ 필수. 컬러·사이즈 1개 이상, 원가 구간 1개 이상(가격 계산 원천).
 */
/** 라벨은 i18n `product.check.<key>` (CLAUDE.md 규칙 10) */
export type PublishCheck = { key: string; ok: boolean };
export function publishChecks(p: {
  verified_in_person: boolean;
  photo_count: number;
  has_real_photo: boolean;
  sample_ok: boolean;
  fabric_pct_sum: number;
  origin: string | null;
  care_codes: string[];
  min_qty: number | null;
  weight_g: number | null;
  hold_resolved: boolean; // 원청 상속 포함
  supply_type: string | null;
  vendor_id: string | null;
  color_count: number;
  size_count: number;
  cost_tier_count: number;
  lead_days: number | null;
  production_moq: number | null;
}): PublishCheck[] {
  const needsProduction = p.supply_type === "production" || p.supply_type === "mixed";
  return [
    { key: "verified", ok: p.verified_in_person },
    { key: "photos", ok: p.photo_count >= 5 && p.has_real_photo },
    { key: "sample_ok", ok: p.sample_ok },
    { key: "fabric", ok: Math.round(p.fabric_pct_sum) === 100 },
    { key: "origin", ok: !!p.origin },
    { key: "care", ok: p.care_codes.length > 0 },
    { key: "min_qty", ok: (p.min_qty ?? 0) > 0 },
    { key: "weight", ok: (p.weight_g ?? 0) > 0 },
    { key: "hold", ok: p.hold_resolved },
    { key: "supply", ok: !!p.supply_type && (!needsProduction || ((p.lead_days ?? 0) > 0 && (p.production_moq ?? 0) > 0)) },
    { key: "colors", ok: p.color_count > 0 },
    { key: "sizes", ok: p.size_count > 0 },
    { key: "cost", ok: p.cost_tier_count > 0 },
    { key: "vendor", ok: !!p.vendor_id },
  ];
}
export const canRequestReview = (checks: PublishCheck[]) => checks.every((c) => c.ok);
export const canIssueOffer = canRequestReview;
