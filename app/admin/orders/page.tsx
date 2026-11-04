import Link from "next/link";
import { listOrdersForAdmin } from "@/lib/db/admin/orders";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { QuerySelect } from "../_ui/query-select";
import { Due, ListEmpty, Toolbar, brandOptions, lateRow, matchQ, sp, type SearchParams } from "../_ui/ui";

/**
 * A-06 발주 관리 큐: 탭 = 전체 / 재고 확인 / 선금 / 견적·확정 / 출고·검품 / 브랜드 차례 / 미송 / 크레딧 처리. 기한 순.
 * 검색(브랜드) + 브랜드 필터. 각 행에 "다음 행동" 한 줄. 레이아웃이 ADMIN을 검증한다.
 */
const TABS = ["all", "stock", "deposit", "quote", "ship", "brand", "backorder", "credit"] as const;
type Tab = (typeof TABS)[number];
const STAGE: Record<Exclude<Tab, "all" | "backorder" | "credit">, string[]> = {
  stock: ["reserved", "stock_checking", "stock_short", "stock_confirmed", "partial_confirmed"],
  deposit: ["deposit_pending", "hold_confirmed"],
  quote: ["quoting", "qty_confirmed", "final_quoted"],
  ship: ["confirmed", "cn_shipped", "kr_inspecting"],
  brand: ["quoted", "sent_to_brand", "delivered"],
};
const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp(p.tab) ?? "") ? (sp(p.tab) as Tab) : "all";
  const q = sp(p.q);
  const brand = sp(p.brand);
  const all = await listOrdersForAdmin();
  const now = new Date();
  const scoped = all.filter((r) => { const b = one(r.brands); return (!brand || b?.slug === brand) && matchQ(q, b?.name, b?.slug); });
  const inTab = (t: Tab) => {
    if (t === "all") return scoped;
    if (t === "backorder") return scoped.filter((r) => r.order_lines.some((l) => l.backorder_status === "backordered"));
    if (t === "credit") return scoped.filter((r) => r.status === "report_done" && r.credit_issued_krw === 0);
    return scoped.filter((r) => STAGE[t].includes(r.status));
  };
  const rows = inTab(tab);
  const cur = { tab: tab === "all" ? undefined : tab, q, brand };

  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.deals")} title={tk("admin.orders.title")} count={all.length} description={tk("admin.orders.lead")}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
          tabs={TABS.map((t) => ({ key: t, label: t === "all" ? tk("admin.ui.all") : tk(`admin.orders.section.${t}`), count: inTab(t).length, tone: t === "backorder" || t === "deposit" ? "warn" : t === "brand" ? "brand" : "default", href: withQuery("/admin/orders", cur, { tab: t === "all" ? null : t }) }))} />
      </PageHeader>
      <Toolbar>
        <SearchBox className="w-full max-w-sm" placeholder={tk("admin.samples.searchPh")} label={tk("admin.ui.search")} />
        <QuerySelect param="brand" label={tk("admin.ui.brandFilter")} allLabel={tk("admin.ui.allBrands")} options={brandOptions(all.map((r) => one(r.brands) ?? {}))} />
      </Toolbar>
      {rows.length === 0 ? (
        <ListEmpty filtered={!!(q || brand)} resetHref={withQuery("/admin/orders", { tab: cur.tab }, {})} title={tk("admin.orders.empty")} help={tk("admin.orders.emptyHelp")} />
      ) : (
        <table className="table-ui">
          <thead>
            <tr>
              <th>{tk("admin.orders.col.order")}</th>
              <th className="text-right">{tk("admin.samples.col.qty")}</th>
              <th className="text-right">{tk("admin.orders.col.deposit")}</th>
              <th>{tk("admin.ui.nextAction")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th className="text-right">{tk("admin.requests.col.due")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = one(r.brands);
              const qty = r.order_lines.reduce((s, l) => s + (l.qty || l.expected_qty), 0);
              const back = r.order_lines.filter((l) => l.backorder_status === "backordered").length;
              const late = isOverdue(r.due_at, now);
              return (
                <tr key={r.id} className={lateRow(late)}>
                  <td>
                    <Link href={`/admin/orders/${r.id}`} className="font-medium hover:underline">{b?.name ?? "-"}</Link>
                    <div className="num mt-0.5 text-caption text-muted">
                      {tk("admin.orders.createdAt", { date: fmtDate(r.created_at) })}
                      {back > 0 && <span className="ml-2 font-semibold text-warn">{tk("admin.orders.backorderOpen", { n: back })}</span>}
                    </div>
                  </td>
                  <td className="num text-right text-ink-2">{tk("order.list.qty", { n: qty })}</td>
                  <td className="num text-right">
                    {r.deposit_krw != null ? `₩${krw(r.deposit_krw)}` : <span className="text-muted">-</span>}
                    {r.deposit_reported_at && !r.deposit_confirmed_at && <span className="ml-1.5 rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">{tk("admin.samples.reported")}</span>}
                  </td>
                  <td className="text-meta text-ink-2">{tk(`admin.orders.next.${r.status}`)}</td>
                  <td><StatusPill entity="order" status={r.status} /></td>
                  <td className="text-right"><Due at={r.due_at} now={now} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
