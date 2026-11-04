import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { MarkReadButton } from "./mark-read-button";
import { PageHeader } from "./page-header";

/**
 * 알림 목록 (공통, 브랜드·관리자·CN). 즉시(공이 넘어옴)는 강조, 다이제스트는 보조. 문구는 이미 수신자 로케일로 만들어진 제목.
 * 선택: eyebrow·toolbar(탭 등)·unreadTotal(필터로 rows가 줄었을 때 전체 안 읽은 수)·emptyText(필터 결과가 비었을 때 문구).
 */
type Row = { id: string; kind: string; title: string; link_path: string | null; read_at: string | null; created_at: string };

export function NotificationList({ rows, locale, eyebrow, toolbar, unreadTotal, emptyText }: {
  rows: Row[]; locale: Locale; eyebrow?: string; toolbar?: React.ReactNode; unreadTotal?: number; emptyText?: React.ReactNode;
}) {
  const unread = unreadTotal ?? rows.filter((r) => !r.read_at).length;
  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title={t(locale, "notifications.title")}
        count={unread > 0 ? unread : null}
        actions={unread > 0 ? <MarkReadButton label={t(locale, "notifications.readAll")} /> : null}
      >
        {toolbar}
      </PageHeader>
      {rows.length === 0 ? (
        emptyText ?? <p className="rounded-ui border border-dashed border-line-strong py-16 text-center text-lead text-ink-2">{t(locale, "notifications.empty")}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const body = (
              <span className="relative flex items-start justify-between gap-4 px-4 py-3.5">
                {!r.read_at && r.kind === "instant" && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signature" />}
                <span className="flex min-w-0 items-start gap-2.5">
                  <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${r.read_at ? "bg-transparent" : r.kind === "instant" ? "bg-signature" : "bg-ink-2"}`} />
                  <span className={`text-lead ${r.read_at ? "text-ink-2" : "font-semibold text-ink"}`}>{r.title}</span>
                </span>
                <span className="num mt-0.5 shrink-0 text-caption text-muted">{fmtDate(r.created_at, locale, true)}</span>
              </span>
            );
            return <li key={r.id}>{r.link_path ? <Link href={r.link_path} className="block transition-colors hover:bg-paper">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
