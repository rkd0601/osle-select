import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate, fmtDay } from "@/lib/format";
import { MarkReadButton } from "./mark-read-button";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";

/**
 * 알림 목록 (공통, 브랜드·관리자·CN). 디자인 v2: 1px 룰 사이 행(상자 없음). 안 읽은 즉시 알림(공이 넘어옴)은 ink 점 + 500, 다이제스트는 테두리 점.
 * 문구는 이미 수신자 로케일로 만들어진 제목. 선택: eyebrow·toolbar(탭 등)·unreadTotal(필터로 rows가 줄었을 때 전체 안 읽은 수)·emptyText.
 * brand=true(브랜드 v2.2, d-11): 머리는 호출부가 12칸 그리드로 그린다 — 여기선 목록만. 점 없이 안 읽음은 글자 굵기로, 날짜는 "11월 18일 14:36".
 */
type Row = { id: string; kind: string; title: string; link_path: string | null; read_at: string | null; created_at: string };

const hm = (v: string) => new Intl.DateTimeFormat("ko", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(v));

export function NotificationList({ rows, locale, eyebrow, toolbar, unreadTotal, emptyText, brand = false }: {
  rows: Row[]; locale: Locale; eyebrow?: string; toolbar?: React.ReactNode; unreadTotal?: number; emptyText?: React.ReactNode; brand?: boolean;
}) {
  const unread = unreadTotal ?? rows.filter((r) => !r.read_at).length;
  return (
    <div>
      {!brand && <PageHeader
        eyebrow={eyebrow}
        title={t(locale, "notifications.title")}
        count={unread > 0 ? unread : null}
        actions={unread > 0 ? <MarkReadButton label={t(locale, "notifications.readAll")} /> : null}
      >
        {toolbar}
      </PageHeader>}
      {rows.length === 0 ? (
        emptyText ?? <EmptyState title={t(locale, "notifications.empty")} />
      ) : (
        <ul className="rows">
          {rows.map((r) => {
            const dot = r.read_at ? "bg-transparent" : r.kind === "instant" ? "bg-ink" : "border border-line-strong";
            const body = (
              <>
                <span className="flex min-w-0 items-start gap-3">
                  {!brand && <span aria-hidden className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
                  <span className={`min-w-0 text-lead ${r.read_at ? "text-ink-2" : "font-medium text-ink"}`}>{r.title}</span>
                </span>
                <span className="num shrink-0 text-meta text-muted">{brand ? `${fmtDay(r.created_at)} ${hm(r.created_at)}` : fmtDate(r.created_at, locale, true)}</span>
              </>
            );
            const cls = "row grid-cols-[minmax(0,1fr)_auto] items-start";
            return <li key={r.id}>{r.link_path ? <Link href={r.link_path} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
