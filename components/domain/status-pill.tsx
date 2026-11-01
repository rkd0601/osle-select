import { t, type Locale } from "@/lib/i18n";

/** 상태 pill (공통 컴포넌트 1/8). 톤은 "누구 차례인가"를 따른다: 브랜드 차례=시그니처, 지연·보완=경고, 종료=뮤트. */
type Entity = "request" | "request_item" | "product" | "sample_request";
const TONE: Record<string, "brand" | "warn" | "muted" | "ink"> = {
  needs_info: "warn", on_hold: "muted", offered: "brand", selected: "brand", closed: "muted", cancelled: "muted",
  // product
  draft: "muted", rejected: "warn", recheck: "warn", reviewed: "brand", offering: "brand", repool: "ink", hidden: "muted",
  // sample_request (브랜드 차례: 입금 대기·받기·피드백)
  awaiting_payment: "warn", sent_to_brand: "brand", delivered: "brand", feedback_done: "ink",
};
const CLS = {
  brand: "bg-signature-soft text-signature",
  warn: "bg-warn-soft text-warn",
  muted: "bg-sand text-ink-2",
  ink: "bg-surface text-ink border border-line",
};

export function StatusPill({ entity, status, locale = "ko" }: { entity: Entity; status: string; locale?: Locale }) {
  const tone = TONE[status] ?? "ink";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CLS[tone]}`} data-status={status}>
      {t(locale, `status.${entity}.${status}`)}
    </span>
  );
}
