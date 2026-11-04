import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/db/notifications";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { MarkReadButton } from "@/components/domain/mark-read-button";
import { fmtDate } from "@/lib/format";
import { t } from "@/lib/i18n/cn";

/**
 * CN 알림 (zh-CN). WeCom으로도 같은 제목이 간다. 전체/읽지 않음 탭(건수 muted).
 * 디자인 v2: 룰로 나눈 행 — 읽지 않은 즉시 알림은 채운 점, 다이제스트는 테두리 점, 읽은 건 점 없음 · 제목 · 시각(SUIT 13 muted, 오른쪽).
 */
export default async function CnNotifications({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/notifications");
  const L = u.locale;
  const { f } = await searchParams;
  const onlyUnread = f === "unread";
  const all = await listMyNotifications();
  const unread = all.filter((r) => !r.read_at).length;
  const rows = onlyUnread ? all.filter((r) => !r.read_at) : all;

  return (
    <div>
      <PageHeader
        title={t(L, "notifications.title")}
        count={unread || null}
        actions={unread > 0 ? <span className="inline-flex [&>button]:min-h-10"><MarkReadButton label={t(L, "notifications.readAll")} /></span> : undefined}
      />
      <FilterTabs
        label={t(L, "cn.filter.label")}
        active={onlyUnread ? "unread" : "all"}
        tabs={[
          { key: "all", label: t(L, "cn.filter.all"), href: "/cn/notifications", count: all.length },
          { key: "unread", label: t(L, "cn.notif.unread"), href: "/cn/notifications?f=unread", count: unread },
        ]}
      />
      {rows.length === 0 ? (
        onlyUnread
          ? <EmptyState compact title={t(L, "cn.notif.unreadEmpty")} action={{ href: "/cn/notifications", label: t(L, "cn.filter.all") }} />
          : <EmptyState title={t(L, "notifications.empty")} />
      ) : (
        <ul>
          {rows.map((r) => {
            const body = (
              <span className="grid min-h-14 grid-cols-[6px_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line py-4">
                <span aria-hidden className={r.read_at ? "" : r.kind === "instant" ? "st" : "st wait"} />
                <span className={`text-body ${r.read_at ? "text-ink-2" : "font-medium text-ink"}`}>{r.title}</span>
                <span className="num text-meta text-muted">{fmtDate(r.created_at, L, true)}</span>
              </span>
            );
            return <li key={r.id}>{r.link_path ? <Link href={r.link_path} className="block hover:bg-[linear-gradient(90deg,var(--surface),transparent)]">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
