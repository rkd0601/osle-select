import { t, type Locale } from "@/lib/i18n";

/**
 * 상태 점 `.st` (디자인 v2 §4 — StatusPill 대체). 6px 점 + 13px 글자, 배경 pill 없음.
 * 톤은 "누구 차례인가": 브랜드 차례 = mine(금색 점·ink 500), 확인 필요 = warn, 지연 = crit, 끝남 = done(ok 점·muted), 남의 차례 대기 = wait(테두리 점).
 * 이전 이름 StatusPill은 같은 컴포넌트를 가리킨다(화면 코드 변경 없이 v2 모양).
 */
type Entity = "request" | "request_item" | "product" | "sample_request" | "order";
export type StatusTone = "mine" | "warn" | "crit" | "done" | "wait" | "default";

const TONE: Record<string, StatusTone> = {
  // request / request_item
  needs_info: "mine", offered: "mine", selected: "default", on_hold: "wait", closed: "done", cancelled: "done", received: "wait",
  // product
  draft: "wait", rejected: "warn", recheck: "warn", reviewed: "default", offering: "default", repool: "default", hidden: "done", pending_review: "wait",
  // sample_request (브랜드 차례: 입금 대기·받기·피드백)
  awaiting_payment: "mine", sent_to_brand: "mine", delivered: "mine", feedback_done: "default",
  // order (브랜드 차례: 선금·수량 확정·최종 견적 동의·받기·검수 보고 / 재고 부족은 경고)
  deposit_pending: "mine", quoted: "mine", stock_short: "warn", report_done: "done", final_quoted: "wait",
};

/** entity에 따라 같은 상태값의 톤이 다를 때를 위한 덮어쓰기 */
const ENTITY_TONE: Partial<Record<Entity, Record<string, StatusTone>>> = {
  order: { delivered: "mine", sent_to_brand: "mine" },
};

export function StatusDot({ entity, status, locale = "ko", tone }: { entity: Entity; status: string; locale?: Locale; tone?: StatusTone }) {
  const tn = tone ?? ENTITY_TONE[entity]?.[status] ?? TONE[status] ?? "default";
  return (
    <span className={`st ${tn === "default" ? "" : tn}`} data-status={status}>
      {t(locale, `status.${entity}.${status}`)}
    </span>
  );
}

export const StatusPill = StatusDot;
