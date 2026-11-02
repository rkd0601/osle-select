/**
 * 감사 로그 화면 분류 (순수, CLAUDE.md 절대 규칙 12). 돈 탭 = 금액·요율·크레딧·입금·청구를 바꾸는 액션.
 * 새 돈 관련 액션을 추가하면 여기에 접두어 또는 이름을 더한다(테스트가 현재 목록을 고정).
 */
export const MONEY_PREFIXES = ["price.", "payment.", "settings."] as const;
export const MONEY_ACTIONS = [
  "order.confirm", "order.credit", "order.credit_mismatch", "order.invoice_rebuild", "order.deposit_request", "order.deposit_report", "order.quote_range", "order.quote_final",
  "brand.credit_adjust", "brand.terms_update", "sample.charge", "sample.credit",
] as const;

export const isMoneyAction = (action: string) => MONEY_PREFIXES.some((p) => action.startsWith(p)) || (MONEY_ACTIONS as readonly string[]).includes(action);

export type AuditTab = "all" | "money" | "proxy";
export const AUDIT_TABS: AuditTab[] = ["all", "money", "proxy"];

export type AuditFilter = { tab: AuditTab; actor?: string; entity?: string; action?: string; from?: string; to?: string; page: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** URL 검색 파라미터 → 필터 (모르는 값은 버린다 — 쿼리에 그대로 넣지 않는다) */
export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined))?.trim() || undefined;
  const tab = one("tab");
  const page = Math.max(1, Math.min(500, Math.trunc(Number(one("page") ?? 1)) || 1));
  return {
    tab: (AUDIT_TABS as string[]).includes(tab ?? "") ? (tab as AuditTab) : "all",
    actor: one("actor") && UUID.test(one("actor")!) ? one("actor") : undefined,
    entity: one("entity") && /^[a-z_]{2,40}$/.test(one("entity")!) ? one("entity") : undefined,
    action: one("action") && /^[a-z_.]{2,60}$/.test(one("action")!) ? one("action") : undefined,
    from: one("from") && DAY.test(one("from")!) ? one("from") : undefined,
    to: one("to") && DAY.test(one("to")!) ? one("to") : undefined,
    page,
  };
}

/** 돈 탭 PostgREST or 식: action.like.price.*,… */
export const moneyOrFilter = () =>
  [...MONEY_PREFIXES.map((p) => `action.like.${p}*`), ...MONEY_ACTIONS.map((a) => `action.eq.${a}`)].join(",");

/** 기간 끝은 그날 끝까지(KST 기준 날짜 → UTC 경계) */
export const kstStart = (day: string) => new Date(`${day}T00:00:00+09:00`).toISOString();
export const kstEndExclusive = (day: string) => new Date(new Date(`${day}T00:00:00+09:00`).getTime() + 86_400_000).toISOString();

export const AUDIT_PAGE_SIZE = 100;
