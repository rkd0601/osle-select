import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate, isOverdue } from "@/lib/format";
import type { OwnerRole } from "@/lib/sla";

/**
 * 내 차례 `.handoff` (디자인 v2 §4, PRD 9장 핸드오프). 왼쪽 2px 금색 룰 + 위아래 1px 룰.
 * 1행: 상태 점 "내 차례" + 기한(임박·지연이면 warn/crit). 2행: 제목 20/500(행동 + 금액). 3행: 설명 한 문장(선택). 오른쪽 버튼(2~4자 동사, 화살표 없음).
 * 남의 차례(theirs)는 룰 line-strong, 제목 400 ink-2, 버튼 없음. 문구는 호출부가 i18n 키로 넘긴다.
 */
export function HandoffCard(props: {
  owner: OwnerRole;
  due: string | null;
  title: string;
  decide?: string | null;
  cta?: { href: string; label: string };
  locale?: Locale;
  children?: React.ReactNode; // 오른쪽 행동(버튼·폼) — cta 대신
  className?: string;
}) {
  const L = props.locale ?? "ko";
  const late = isOverdue(props.due);
  const soon = !late && !!props.due && new Date(props.due).getTime() - Date.now() < 2 * 86400000;
  const mine = props.owner === "BRAND" && L === "ko";
  const action = props.children ?? (mine && props.cta ? <Link href={props.cta.href} className="btn">{props.cta.label}</Link> : null);
  return (
    <section className={`handoff ${mine ? "" : "theirs"} ${props.className ?? ""}`}>
      <div className="min-w-0">
        <div className="top">
          <span className={`st ${mine ? "mine" : "wait"}`}>{props.owner ? t(L, `owner.${props.owner}`) : ""}</span>
          {props.due && <span className={`due ${late ? "text-crit" : soon ? "soon" : ""}`}>{t(L, late ? "common.overdue" : "common.dueIn", { date: fmtDate(props.due, L, true) })}</span>}
        </div>
        <div className="t">{props.title}</div>
        {props.decide && <p className="d">{props.decide}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}

export const Handoff = HandoffCard;
