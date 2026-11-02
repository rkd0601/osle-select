import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate, isOverdue } from "@/lib/format";
import type { OwnerRole } from "@/lib/sla";

/**
 * 핸드오프 카드 (공통 컴포넌트 2/8, PRD 9장): 담당자 · 기한 · 결정할 것 · 정보 · CTA.
 * "지금 누구 차례인지"를 한눈에. 내용 문구는 호출부가 i18n 키로 넘긴다.
 */
export function HandoffCard(props: {
  owner: OwnerRole;
  due: string | null;
  title: string;
  decide: string;
  cta?: { href: string; label: string };
  locale?: Locale;
  children?: React.ReactNode;
}) {
  const L = props.locale ?? "ko";
  const late = isOverdue(props.due);
  const mine = props.owner === "BRAND" && L === "ko";
  return (
    <section className={`border-l-2 ${mine ? "border-signature" : "border-line"} bg-surface px-5 py-4`}>
      <div className="flex items-center justify-between gap-3 text-caption uppercase tracking-wide text-muted">
        <span className={mine ? "font-semibold text-signature" : ""}>{props.owner ? t(L, `owner.${props.owner}`) : ""}</span>
        {props.due && (
          <span className={`num ${late ? "text-crit" : ""}`}>{t(L, late ? "common.overdue" : "common.dueIn", { date: fmtDate(props.due, L, true) })}</span>
        )}
      </div>
      <h2 className="mt-1.5 text-h4 font-bold tracking-tight">{props.title}</h2>
      <p className="mt-1 text-body text-ink-2">{props.decide}</p>
      {props.children && <div className="mt-3">{props.children}</div>}
      {props.cta && (
        <Link href={props.cta.href} className="mt-3 inline-block bg-ink px-4 py-2 text-body font-medium text-paper">
          {props.cta.label}
        </Link>
      )}
    </section>
  );
}
