import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { MarkReadButton } from "./mark-read-button";

/**
 * 알림 목록 (공통, 브랜드·관리자·CN). 즉시(공이 넘어옴)는 강조, 다이제스트는 보조. 문구는 이미 수신자 로케일로 만들어진 제목.
 */
export function NotificationList({ rows, locale }: { rows: { id: string; kind: string; title: string; link_path: string | null; read_at: string | null; created_at: string }[]; locale: Locale }) {
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <div>
      <div className="flex items-end justify-between border-b border-ink pb-3">
        <h1 className="text-h1 font-bold tracking-tight">{t(locale, "notifications.title")} {unread > 0 && <span className="num text-lead text-signature">{unread}</span>}</h1>
        {unread > 0 && <MarkReadButton label={t(locale, "notifications.readAll")} />}
      </div>
      {rows.length === 0 ? <p className="py-16 text-center text-lead text-muted">{t(locale, "notifications.empty")}</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const body = (
              <span className="flex items-baseline justify-between gap-3 py-3">
                <span className={`text-lead ${r.read_at ? "text-ink-2" : "font-medium"}`}>
                  {!r.read_at && <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${r.kind === "instant" ? "bg-signature" : "bg-muted"}`} />}
                  {r.title}
                </span>
                <span className="num shrink-0 text-caption text-muted">{fmtDate(r.created_at, locale, true)}</span>
              </span>
            );
            return <li key={r.id}>{r.link_path ? <Link href={r.link_path} className="block hover:bg-surface">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
