import Link from "next/link";
import { Suspense } from "react";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandRequests } from "@/lib/db/brand/requests";
import { StatusDot } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { IndexRow, Rows } from "@/components/domain/index-row";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { dueOf, matches, SEARCH_FROM, TABS_FROM, type ListQuery } from "../_ui/list";

/**
 * B-03 요청 목록 (디자인 v2): 인덱스 행(제목 · 메타 / 상태 점 / 내 기한). 내 차례는 왼쪽 금색 룰 + 위로.
 * 탭(전체 / 내 차례 / 진행 중 / 완료)은 행이 많을 때만, 제목 검색은 20건 이상일 때만 — URL 쿼리로 서버가 거른다.
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
  const showTabs = rows.length > TABS_FROM;
  const showSearch = rows.length >= SEARCH_FROM;
  const tab: Tab = showTabs && sp.tab && sp.tab in inTab ? (sp.tab as Tab) : "all";
  const searched = showSearch ? rows.filter((r) => matches(sp.q, r.title)) : rows;
  const shown = searched.filter(inTab[tab]).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.created_at.localeCompare(a.created_at));
  const tabs = (["all", "mine", "active", "done"] as const).map((k) => ({
    key: k, label: tk(`list.tab.${k}`), href: withQuery(base, { q: sp.q }, { tab: k === "all" ? null : k }), count: searched.filter(inTab[k]).length,
  }));

  return (
    <div>
      <PageHeader
        eyebrow={tk("eyebrow.requests")}
        title={tk("request.list.title")}
        count={rows.length || null}
        actions={<Link href={`${base}/new`} className="btn">{tk("request.list.new")}</Link>}
      >
        {(showTabs || showSearch) && (
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            {showTabs ? <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} /> : <span />}
            {showSearch && <Suspense><SearchBox className="md:w-72" placeholder={tk("request.list.searchPh")} label={tk("request.list.searchPh")} /></Suspense>}
          </div>
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={tk("request.list.empty")} action={{ href: `${base}/new`, label: tk("request.list.new") }} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={tk("list.emptyFiltered")} action={{ href: base, label: tk("list.reset") }} />
      ) : (
        <Rows>
          {shown.map((r) => {
            const d = mine(r) ? dueOf(r.brandDue) : null;
            return (
              <IndexRow
                key={r.id}
                href={`${base}/${r.id}`}
                mine={mine(r)}
                title={r.title ?? tk("request.untitled")}
                meta={[fmtDate(r.created_at), tk("home.items", { n: r.itemCount }), r.target_date ? tk("request.detail.targetDate", { date: fmtDate(r.target_date) }) : null].filter(Boolean).join(" · ")}
                status={<StatusDot entity="request" status={r.status} />}
                due={d?.text}
                dueTone={d?.tone}
              />
            );
          })}
        </Rows>
      )}
    </div>
  );
}
