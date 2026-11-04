import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/db/notifications";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { MarkReadButton } from "@/components/domain/mark-read-button";
import { fmtDate } from "@/lib/format";
import { t } from "@/lib/i18n/cn";

/** CN 알림 (zh-CN). WeCom으로도 같은 제목이 간다. 즉시(공이 넘어옴)는 시그니처 점, 다이제스트는 회색 점. 전체/읽지 않음 탭 */
export default async function CnNotifications({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/notifications");
  const L = u.locale;
  const { f } = await searchParams;
  const onlyUnread = f === "unread";
  const all = await listMyNotifications();
  const unread = all.filter((r) => !r.read_at).length;
  const rows = onlyUnread ? all.filter((r) => !r.read_at) : all;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={t(L, "cn.title")}
        title={t(L, "notifications.title")}
        count={unread || null}
        actions={unread > 0 ? <MarkReadButton label={t(L, "notifications.readAll")} /> : undefined}
      >
        <nav aria-label={t(L, "cn.filter.label")} className="flex gap-2">
          {([["all", t(L, "cn.filter.all"), "/cn/notifications", all.length], ["unread", t(L, "cn.notif.unread"), "/cn/notifications?f=unread", unread]] as const).map(([k, label, to, n]) => (
            <Link key={k} href={to} className="chip min-h-10" aria-current={(onlyUnread ? "unread" : "all") === k ? "true" : undefined}>{label}<span className="count">{n}</span></Link>
          ))}
        </nav>
      </PageHeader>
      {rows.length === 0 ? (
        onlyUnread
          ? <EmptyState compact title={t(L, "cn.notif.unreadEmpty")} action={{ href: "/cn/notifications", label: t(L, "cn.filter.all") }} />
          : <EmptyState title={t(L, "notifications.empty")} help={t(L, "cn.notif.empty.help")} />
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((r) => {
            const body = (
              <span className="flex min-h-12 items-start gap-3 px-4 py-3">
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${r.read_at ? "bg-transparent" : r.kind === "instant" ? "bg-signature" : "bg-muted"}`} />
                <span className={`min-w-0 flex-1 text-body ${r.read_at ? "text-ink-2" : "font-medium text-ink"}`}>{r.title}</span>
                <span className="num shrink-0 pt-0.5 text-caption text-muted">{fmtDate(r.created_at, L, true)}</span>
              </span>
            );
            return <li key={r.id}>{r.link_path ? <Link href={r.link_path} className="block hover:bg-paper">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
