/**
 * 상태 → 담당자(owner_role)·기한(due_at). PRD 4장.
 * 모든 상태 객체는 전이 직후 이 함수로 owner_role/due_at을 갱신한다.
 */
import { DEFAULT_SETTINGS, type Role, type Settings } from "./config";
import type { Entity } from "./transitions";

export type OwnerRole = "ADMIN" | "CN" | "BRAND" | null;

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600000);
/** 영업일 가산(토·일 제외, 공휴일은 2차) */
export function addBusinessDays(d: Date, days: number): Date {
  const out = new Date(d);
  let left = days;
  while (left > 0) {
    out.setDate(out.getDate() + 1);
    const w = out.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return out;
}

export function ownerAndDue(
  entity: Entity,
  status: string,
  now: Date,
  s: Settings = DEFAULT_SETTINGS,
  ctx: { sla_date?: Date | null; exclusive_until?: Date | null } = {},
): { owner_role: OwnerRole; due_at: Date | null } {
  const map: Record<Entity, Record<string, () => { owner_role: OwnerRole; due_at: Date | null }>> = {
    request_item: {
      received: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, s.intake_sla_days) }),
      needs_info: () => ({ owner_role: "BRAND", due_at: addDays(now, 2) }),
      assigned: () => ({ owner_role: "CN", due_at: ctx.sla_date ?? addDays(now, 5) }),
      sourcing: () => ({ owner_role: "CN", due_at: ctx.sla_date ?? addDays(now, 5) }),
      offered: () => ({ owner_role: "BRAND", due_at: ctx.exclusive_until ?? addDays(now, s.exclusive_days) }),
      selected: () => ({ owner_role: "ADMIN", due_at: null }),
    },
    product: {
      draft: () => ({ owner_role: "CN", due_at: null }),
      pending_review: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, s.review_sla_days) }),
      rejected: () => ({ owner_role: "CN", due_at: addDays(now, 3) }),
      recheck: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
    },
    offer: {
      new: () => ({ owner_role: "BRAND", due_at: ctx.exclusive_until ?? addDays(now, s.exclusive_days) }),
      reconsent_pending: () => ({ owner_role: "BRAND", due_at: addDays(now, s.reconsent_days) }),
      recheck: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
    },
    sample_request: {
      requested: () => ({ owner_role: "CN", due_at: addDays(now, s.cn_ship_days) }),
      awaiting_payment: () => ({ owner_role: "BRAND", due_at: addDays(now, s.deposit_days) }),
      cn_shipped: () => ({ owner_role: "ADMIN", due_at: addDays(now, 7) }),
      kr_arrived: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      inspected: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      sent_to_brand: () => ({ owner_role: "BRAND", due_at: addDays(now, 3) }),
      delivered: () => ({ owner_role: "BRAND", due_at: addDays(now, s.sample_feedback_days) }),
      feedback_done: () => ({ owner_role: "BRAND", due_at: addDays(now, s.sample_return_days) }),
    },
    order: {
      reserved: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      stock_checking: () => ({ owner_role: "CN", due_at: addDays(now, s.stock_check_days) }),
      stock_confirmed: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      partial_confirmed: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      stock_short: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      deposit_pending: () => ({ owner_role: "BRAND", due_at: addDays(now, s.deposit_days) }),
      hold_confirmed: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, s.quote_sla_days) }),
      quoting: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, s.quote_sla_days) }),
      quoted: () => ({ owner_role: "BRAND", due_at: addDays(now, 3) }),
      qty_confirmed: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      final_quoted: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 1) }),
      confirmed: () => ({ owner_role: "CN", due_at: addDays(now, 5) }),
      cn_shipped: () => ({ owner_role: "ADMIN", due_at: addDays(now, 10) }),
      kr_inspecting: () => ({ owner_role: "ADMIN", due_at: addBusinessDays(now, 2) }),
      sent_to_brand: () => ({ owner_role: "BRAND", due_at: addDays(now, 3) }),
      delivered: () => ({ owner_role: "BRAND", due_at: addDays(now, s.report_days) }),
    },
  };
  const fn = map[entity][status];
  return fn ? fn() : { owner_role: null, due_at: null };
}

/** CN 질문 게이트 종료 시각 */
export const cnQuestionGateUntil = (now: Date, s: Settings = DEFAULT_SETTINGS) => addHours(now, s.cn_question_gate_hours);

/** 역할 → owner_role 매핑 (큐 필터용) */
export function roleToOwner(role: Role): OwnerRole {
  if (role === "ADMIN") return "ADMIN";
  if (role === "CN_SOURCER" || role === "CN_VENDOR") return "CN";
  return "BRAND";
}
