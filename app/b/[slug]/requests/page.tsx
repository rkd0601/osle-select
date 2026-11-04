import Link from "next/link";
import { Suspense } from "react";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandRequests } from "@/lib/db/brand/requests";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ListRow, ListTable, matches, type ListQuery } from "../_ui/list";

/**
 * B-03 요청 목록. 집계 상태 + 내 차례 기한. 상품 그리드가 아니라 에디토리얼 리스트(1px 룰).
 * 탭(전체 / 내 차례 / 진행 중 / 완료) + 제목 검색은 URL 쿼리 — 서버에서 이미 읽은 목록을 거른다.
 */
const DONE = ["closed", "cancelled"];
type Tab = "all" | "mine" | "active" | "done";

export default async function RequestsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListQuery> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { brand } = await requireBrandMember(slug);
  const rows = await listBrandRequests(brand.id);
  const base = `/b/${slug}/requests`;

  const mine = (r: (typeof rows)[number]) => !DONE.includes(r.status) && (r.status === "needs_info" || !!r.brandDue);
  const inTab: Record<Tab, (r: (typeof rows)[number]) => boolean> = {
    all: () => true,
    mine,
    active: (r) => !DONE.includes(r.status),
    done: (r) => DONE.includes(r.status),
  };
  const tab: Tab = sp.tab && sp.tab in inTab ? (sp.tab as Tab) : "all";
  const searched = rows.filter((r) => matches(sp.q, r.title));
  const shown = searched.filter(inTab[tab]).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.created_at.localeCompare(a.created_at));
  const tabs = (["all", "mine", "active", "done"] as const).map((k) => ({
    key: k, label: tk(`list.tab.${k}`), href: withQuery(base, { q: sp.q }, { tab: k === "all" ? null : k }), count: searched.filter(inTab[k]).length, tone: k === "mine" ? ("brand" as const) : undefined,
  }));

  return (
    <div>
      <PageHeader
        eyebrow={tk("eyebrow.requests")}
        title={tk("request.list.title")}
        count={rows.length}
        description={tk("request.list.lead")}
        actions={<Link href={`${base}/new`} className="btn btn-primary">{tk("request.list.new")}</Link>}
      >
        {rows.length > 0 && (
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />
            <Suspense><SearchBox className="md:w-72" placeholder={tk("request.list.searchPh")} label={tk("request.list.searchPh")} /></Suspense>
          </div>
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={tk("request.list.empty")} help={tk("request.list.emptyHelp")} action={{ href: `${base}/new`, label: tk("request.list.new") }} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={tk("list.emptyFiltered")} help={tk("list.emptyFilteredHelp")} action={{ href: base, label: tk("list.reset") }} />
      ) : (
        <ListTable head={{ date: tk("list.col.created"), title: tk("list.col.request"), qty: tk("list.col.items"), amount: tk("list.col.targetDate"), due: tk("list.col.due"), status: tk("list.col.status") }}>
          {shown.map((r) => (
            <ListRow
              key={r.id}
              href={`${base}/${r.id}`}
              mine={mine(r)}
              date={fmtDate(r.created_at)}
              title={r.title ?? tk("request.untitled")}
              qty={tk("request.list.items", { n: r.itemCount })}
              amount={r.target_date ? fmtDate(r.target_date) : null}
              due={mine(r) ? r.brandDue : null}
              status={<StatusPill entity="request" status={r.status} />}
            />
          ))}
        </ListTable>
      )}
    </div>
  );
}
