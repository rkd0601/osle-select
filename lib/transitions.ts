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
  awaiting_payment: [{ to: "cn_shipped", by: CN }, { to: "cancelled", by: BRAND_PURCHASE, purchase: true }], // cn_shipped는 서버에서 payment_confirmed_at 확인 후 허용
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
  confirmed: [{ to: "cn_shipped", by: CN }, { to: "qty_confirmed", by: ADMIN }], // 수량 수정 요청 1회는 서버에서 카운트
  cn_shipped: [{ to: "kr_inspecting", by: ADMIN }, { to: "sent_to_brand", by: ADMIN }], // 직송(route=direct)이면 검품 건너뜀
  kr_inspecting: [{ to: "sent_to_brand", by: ADMIN }],
  sent_to_brand: [{ to: "delivered", by: ADMIN }, { to: "delivered", by: BRAND }],
  delivered: [{ to: "report_done", by: BRAND }, { to: "report_done", by: ADMIN }],
  report_done: [],
  cancelled: [],
};

const TABLES: Record<Entity, Table> = { request_item: requestItem, product, offer, sample_request: sampleRequest, order };

/**
 * 행위자. role은 JWT(app_metadata.role), canPurchase는 해당 브랜드의 brand_members(level owner 또는 can_purchase)에서
 * 서버 액션이 조회해 넣는다. 문자열 role만 넘기면 canPurchase=false로 취급(구매 전이 불가).
 */
export type Actor = { role: Role; canPurchase?: boolean };
const toActor = (a: Actor | Role): Actor => (typeof a === "string" ? { role: a } : a);

export class TransitionError extends Error {
  constructor(public entity: Entity, public from: string, public to: string, public role: Role) {
    super(`Transition not allowed: ${entity} ${from} → ${to} by ${role}`);
  }
}

function ruleAllows(r: Rule, actor: Actor): boolean {
  if (!r.by.includes(actor.role)) return false;
  if (r.purchase && actor.role !== "ADMIN" && !actor.canPurchase) return false;
  return true;
}

export function canTransition(entity: Entity, from: string, to: string, actor: Actor | Role): boolean {
  const rules = TABLES[entity][from];
  if (!rules) return false;
  const a = toActor(actor);
  return rules.some((r) => r.to === to && ruleAllows(r, a));
}

export function assertTransition(entity: Entity, from: string, to: string, actor: Actor | Role): void {
  if (!canTransition(entity, from, to, actor)) throw new TransitionError(entity, from, to, toActor(actor).role);
}

export function allowedNext(entity: Entity, from: string, actor: Actor | Role): string[] {
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
export type PublishCheck = { key: string; ok: boolean; label_ko: string; label_zh: string };
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
    { key: "verified", ok: p.verified_in_person, label_ko: "실물 확인", label_zh: "已看实物" },
    { key: "photos", ok: p.photo_count >= 5 && p.has_real_photo, label_ko: "사진 5장 이상(실물컷 포함)", label_zh: "照片≥5(含实拍)" },
    { key: "sample_ok", ok: p.sample_ok, label_ko: "샘플 가능", label_zh: "可打样" },
    { key: "fabric", ok: Math.round(p.fabric_pct_sum) === 100, label_ko: "혼용률 합 100%", label_zh: "成分合计100%" },
    { key: "origin", ok: !!p.origin, label_ko: "원산지", label_zh: "产地" },
    { key: "care", ok: p.care_codes.length > 0, label_ko: "세탁", label_zh: "洗涤" },
    { key: "min_qty", ok: (p.min_qty ?? 0) > 0, label_ko: "최소 수량", label_zh: "最小起订量" },
    { key: "weight", ok: (p.weight_g ?? 0) > 0, label_ko: "중량", label_zh: "重量" },
    { key: "hold", ok: p.hold_resolved, label_ko: "홀딩 조건", label_zh: "锁货条件" },
    { key: "supply", ok: !!p.supply_type && (!needsProduction || ((p.lead_days ?? 0) > 0 && (p.production_moq ?? 0) > 0)), label_ko: "공급 형태(생산이면 리드타임·MOQ)", label_zh: "供货形式(生产需交期·起订量)" },
    { key: "colors", ok: p.color_count > 0, label_ko: "컬러 1개 이상", label_zh: "颜色≥1" },
    { key: "sizes", ok: p.size_count > 0, label_ko: "사이즈 1개 이상", label_zh: "尺码≥1" },
    { key: "cost", ok: p.cost_tier_count > 0, label_ko: "원가 구간", label_zh: "成本价档" },
    { key: "vendor", ok: !!p.vendor_id, label_ko: "원청 연결", label_zh: "档口关联" },
  ];
}
export const canRequestReview = (checks: PublishCheck[]) => checks.every((c) => c.ok);
export const canIssueOffer = canRequestReview;
