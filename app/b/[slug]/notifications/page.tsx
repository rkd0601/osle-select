import { requireBrandMember } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/db/notifications";
import { NotificationList } from "@/components/domain/notification-list";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { tk } from "@/lib/i18n";
import type { ListQuery } from "../_ui/list";

/** 브랜드 알림 (본인 것만 — RLS). slug 검증은 레이아웃. 탭: 전체 / 안 읽음 / 지금 할 일(즉시 알림) */
export default async function BrandNotifications({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListQuery> }) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireBrandMember(slug);
  const all = await listMyNotifications();
  const base = `/b/${slug}/notifications`;
  const IN = { all: () => true, unread: (r: (typeof all)[number]) => !r.read_at, instant: (r: (typeof all)[number]) => r.kind === "instant" } as const;
  const tab = (sp.tab && sp.tab in IN ? sp.tab : "all") as keyof typeof IN;
  const rows = all.filter(IN[tab]);
  const tabs = (["all", "unread", "instant"] as const).map((k) => ({
    key: k, label: tk(`notifications.tab.${k}`), href: withQuery(base, {}, { tab: k === "all" ? null : k }), count: all.filter(IN[k]).length, tone: k === "unread" ? ("brand" as const) : undefined,
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <NotificationList
        rows={rows}
        locale="ko"
        eyebrow={tk("eyebrow.notifications")}
        unreadTotal={all.filter((r) => !r.read_at).length}
        toolbar={all.length > 0 ? <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} /> : null}
        emptyText={all.length > 0 ? <EmptyState compact title={tk("list.emptyFiltered")} action={{ href: base, label: tk("list.reset") }} /> : undefined}
      />
    </div>
  );
}
