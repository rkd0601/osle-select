import { requireBrandMember } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/db/notifications";
import { NotificationList } from "@/components/domain/notification-list";
import { MarkReadButton } from "@/components/domain/mark-read-button";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { tk } from "@/lib/i18n";
import { TABS_FROM, type ListQuery } from "../_ui/list";

/**
 * 브랜드 알림 (본인 것만 — RLS). slug 검증은 레이아웃. 디자인 v2.2: 12칸 — 머리 8("알림 n") + 4("모두 읽음") → 잉크 룰 → 본문 8.
 * 점·눈썹 없이 안 읽음은 글자 굵기로, 날짜는 "11월 18일 14:36"(d-11). 탭(전체 / 안 읽음 / 할 일 알림)은 알림이 많을 때만.
 */
export default async function BrandNotifications({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListQuery> }) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireBrandMember(slug);
  const all = await listMyNotifications();
  const base = `/b/${slug}/notifications`;
  const IN = { all: () => true, unread: (r: (typeof all)[number]) => !r.read_at, instant: (r: (typeof all)[number]) => r.kind === "instant" } as const;
  const showTabs = all.length > TABS_FROM;
  const tab = (showTabs && sp.tab && sp.tab in IN ? sp.tab : "all") as keyof typeof IN;
  const rows = all.filter(IN[tab]);
  const unread = all.filter((r) => !r.read_at).length;
  const tabs = (["all", "unread", "instant"] as const).map((k) => ({
    key: k, label: tk(`notifications.tab.${k}`), href: withQuery(base, {}, { tab: k === "all" ? null : k }), count: all.filter(IN[k]).length,
  }));
  return (
    <div className="g12">
      <div className="c8">
        <h1 className="h1">{tk("notifications.title")}{unread > 0 && <span className="num thin ml-3">{unread}</span>}</h1>
      </div>
      <div className="c4 tr">{unread > 0 && <MarkReadButton label={tk("notifications.readAll")} />}</div>
      <div className="c12 rule-ink" />
      <div className="c8 min-w-0">
        {showTabs && <div className="mb-8"><FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} /></div>}
        <NotificationList
          brand
          rows={rows}
          locale="ko"
          unreadTotal={unread}
          emptyText={all.length > 0 ? <EmptyState compact title={tk("list.emptyFiltered")} action={{ href: base, label: tk("list.reset") }} /> : undefined}
        />
      </div>
    </div>
  );
}
