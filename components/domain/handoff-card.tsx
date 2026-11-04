import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate, isOverdue } from "@/lib/format";
import type { OwnerRole } from "@/lib/sla";

/**
 * 핸드오프 카드 (공통 컴포넌트 2/8, PRD 9장): 담당자 · 기한 · 결정할 것 · 정보 · CTA.
 * "지금 누구 차례인지"를 한눈에. 내 차례 = 시그니처 왼쪽 띠 + 점, 기한 지남 = 위험색. 내용 문구는 호출부가 i18n 키로 넘긴다.
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
    <section className={`card relative overflow-hidden px-5 py-4 ${mine ? "" : "bg-paper shadow-none"}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${late ? "bg-crit" : mine ? "bg-signature" : "bg-line-strong"}`} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 text-caption font-semibold tracking-wide ${mine ? "text-signature" : "text-ink-2"}`}>
          {mine && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signature" />}
          {props.owner ? t(L, `owner.${props.owner}`) : ""}
        </span>
        {props.due && (
          <span className={`num rounded-full px-2 py-0.5 text-caption font-medium ${late ? "bg-crit-soft text-crit" : mine ? "bg-signature-soft text-signature" : "bg-sand text-ink-2"}`}>
            {t(L, late ? "common.overdue" : "common.dueIn", { date: fmtDate(props.due, L, true) })}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-h4 font-bold tracking-tight">{props.title}</h2>
      <p className="mt-1 text-body text-ink-2">{props.decide}</p>
      {props.children && <div className="mt-3">{props.children}</div>}
      {props.cta && (
        <Link href={props.cta.href} className={`btn mt-4 ${mine ? "btn-accent" : "btn-primary"}`}>
          {props.cta.label} <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  );
}
