import Link from "next/link";
import { listRequestQueue } from "@/lib/db/admin/requests";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { StatusPill } from "@/components/domain/status-pill";
import { isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { REQUEST_ITEM_STATUS } from "@/lib/transitions";
import type { RequestItemStatus } from "@/lib/requests";
import { QuerySelect } from "../_ui/query-select";
import { Due, ListEmpty, TBL, Toolbar, brandOptions, matchQ, sp, type SearchParams } from "../_ui/ui";

const TABS = ["open", "overdue", "received", "needs_info", "assigned", "sourcing", "offered", "on_hold"] as const;
const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

/**
 * A-02 요청 접수·배정 큐. 항목 단위, 기한 순(지연 먼저). 탭(상태·건수) + 검색(항목·요청 제목·브랜드) + 브랜드 필터.
 * 레이아웃이 ADMIN을 검증한다. 진행 중 목록을 한 번 읽어 탭 건수와 필터를 메모리에서 계산한다.
 */
export default async function AdminRequests({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const status = sp(p.status) ?? "open";
  const q = sp(p.q);
  const brand = sp(p.brand);
  const now = new Date();
  const closedTab = status === "closed" || status === "cancelled"; // 닫힌 상태는 진행 중 목록에 없어 따로 읽는다
  const tab = (TABS as readonly string[]).includes(status) || (REQUEST_ITEM_STATUS as readonly string[]).includes(status) ? status : "open";
  const open = await listRequestQueue({ status: "open", limit: 500 });
  const extra = closedTab ? await listRequestQueue({ status: status as RequestItemStatus, limit: 300 }) : [];

  const filt = (list: typeof open) => list.filter((r) => {
    const b = one(r.brands);
    const req = one(r.requests);
    return (!brand || b?.slug === brand) && matchQ(q, r.description, r.description_zh, req?.title, b?.name, r.seq != null ? `#${r.seq}` : null, r.category);
  });
  const scoped = filt(open);
  const inTab = (t: string) => (t === "open" ? scoped : t === "overdue" ? scoped.filter((r) => isOverdue(r.due_at, now)) : scoped.filter((r) => r.status === t));
  const rows = closedTab ? filt(extra) : inTab(tab);
  const label = (t: string) => (t === "open" ? tk("admin.requests.filter.open") : t === "overdue" ? tk("admin.ui.overdue") : tk(`status.request_item.${t}`));
  const cur = { brand, q };
  const filtered = !!(q || brand);

  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.sourcing")} title={tk("admin.requests.title")} count={open.length} actions={<Link href="/admin/requests/new" className="btn sec">{tk("admin.requests.proxy")}</Link>}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
          tabs={TABS.map((t) => ({ key: t, label: label(t), count: inTab(t).length, tone: t === "overdue" || t === "needs_info" ? "warn" : "default", href: withQuery("/admin/requests", cur, { status: t === "open" ? null : t }) }))} />
      </PageHeader>
      <Toolbar>
        <SearchBox className="w-full max-w-sm" placeholder={tk("admin.requests.searchPh")} label={tk("admin.ui.search")} />
        <QuerySelect param="brand" label={tk("admin.ui.brandFilter")} allLabel={tk("admin.ui.allBrands")} options={brandOptions(open.map((r) => one(r.brands) ?? {}))} />
      </Toolbar>
      {rows.length === 0 ? (
        <ListEmpty filtered={filtered} resetHref={withQuery("/admin/requests", { status: tab === "open" ? undefined : tab }, {})} title={tk("admin.requests.empty")} />
      ) : (
        <table className={TBL}>
          <thead>
            <tr>
              <th>{tk("admin.requests.col.item")}</th>
              <th>{tk("admin.requests.col.brand")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th>{tk("admin.requests.col.owner")}</th>
              <th className="r">{tk("admin.requests.col.due")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = one(r.brands);
              const req = one(r.requests);
              return (
                <tr key={r.id}>
                  <td className="min-w-0">
                    <span className="code">
                      #{r.seq} · {req?.title}
                      {req?.created_via === "admin_proxy" && <> · {tk("request.proxyBadge")}</>}
                      {!r.description_zh && <span className="text-warn"> · {tk("admin.requests.zhMissing")}</span>}
                    </span>
                    <Link href={`/admin/requests/${r.request_id}`} className="font-medium hover:text-signature">{r.description}</Link>
                  </td>
                  <td className="text-ink-2">{b?.name}</td>
                  <td><StatusPill entity="request_item" status={r.status} /></td>
                  <td className={`text-meta ${r.owner_role === "CN" ? "text-warn" : "text-muted"}`}>{r.owner_role ? tk(`admin.queue.ownerRole.${r.owner_role}`) : "-"}</td>
                  <td className="r"><Due at={r.due_at} now={now} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
