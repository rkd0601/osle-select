import Link from "next/link";
import { listSamplesForAdmin } from "@/lib/db/admin/samples";
import { returnOverdue } from "@/lib/samples";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { QuerySelect } from "../_ui/query-select";
import { Due, ListEmpty, Toolbar, brandOptions, lateRow, matchQ, sp, type SearchParams } from "../_ui/ui";

/**
 * A-05 샘플 관리 큐: 탭 = 전체 / 입금 확인 대기 / 중국 출고 / 위아더 도착·검품 / 브랜드 발송·피드백·회수 / **회수 기한 경과**(자동 표시, 청구는 수동).
 * 검색(브랜드) + 브랜드 필터. 레이아웃이 ADMIN을 검증한다.
 */
const TABS = ["all", "payment", "cn", "inspect", "brand", "overdue"] as const;
type Tab = (typeof TABS)[number];
const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export default async function AdminSamples({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp(p.tab) ?? "") ? (sp(p.tab) as Tab) : "all";
  const q = sp(p.q);
  const brand = sp(p.brand);
  const all = await listSamplesForAdmin();
  const now = new Date();
  const scoped = all.filter((r) => { const b = one(r.brands); return (!brand || b?.slug === brand) && matchQ(q, b?.name, b?.slug); });
  const inTab = (t: Tab) => {
    switch (t) {
      case "payment": return scoped.filter((r) => r.status === "awaiting_payment");
      case "cn": return scoped.filter((r) => r.status === "requested" || r.status === "cn_shipped");
      case "inspect": return scoped.filter((r) => r.status === "kr_arrived" || r.status === "inspected");
      case "brand": return scoped.filter((r) => ["sent_to_brand", "delivered", "feedback_done"].includes(r.status));
      case "overdue": return scoped.filter((r) => r.items.some((i) => returnOverdue(i, r.return_due, now)));
      default: return scoped;
    }
  };
  const rows = inTab(tab);
  const cur = { tab: tab === "all" ? undefined : tab, q, brand };

  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.deals")} title={tk("admin.samples.title")} count={all.length} description={tk("admin.samples.lead")}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
          tabs={TABS.map((t) => ({ key: t, label: t === "all" ? tk("admin.ui.all") : tk(`admin.samples.section.${t}`), count: inTab(t).length, tone: t === "overdue" || t === "payment" ? "warn" : "default", href: withQuery("/admin/samples", cur, { tab: t === "all" ? null : t }) }))} />
      </PageHeader>
      <Toolbar>
        <SearchBox className="w-full max-w-sm" placeholder={tk("admin.samples.searchPh")} label={tk("admin.ui.search")} />
        <QuerySelect param="brand" label={tk("admin.ui.brandFilter")} allLabel={tk("admin.ui.allBrands")} options={brandOptions(all.map((r) => one(r.brands) ?? {}))} />
      </Toolbar>
      {rows.length === 0 ? (
        <ListEmpty filtered={!!(q || brand)} resetHref={withQuery("/admin/samples", { tab: cur.tab }, {})} title={tk("admin.samples.empty")} help={tk("admin.samples.emptyHelp")} />
      ) : (
        <table className="table-ui">
          <thead>
            <tr>
              <th>{tk("admin.samples.col.request")}</th>
              <th className="text-right">{tk("admin.samples.col.qty")}</th>
              <th className="text-right">{tk("sample.new.logistics")}</th>
              <th>{tk("admin.samples.col.payment")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th className="text-right">{tk("admin.requests.col.due")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = one(r.brands);
              const returnLate = r.items.some((i) => returnOverdue(i, r.return_due, now));
              const late = isOverdue(r.due_at, now) || returnLate;
              return (
                <tr key={r.id} className={lateRow(late)}>
                  <td>
                    <Link href={`/admin/samples/${r.id}`} className="font-medium hover:underline">{b?.name ?? "-"}</Link>
                    <div className="num mt-0.5 text-caption text-muted">
                      {tk("admin.samples.requestedAt", { date: fmtDate(r.created_at) })}
                      {returnLate && <span className="ml-2 font-semibold text-crit">{tk("admin.samples.overdue")}</span>}
                    </div>
                  </td>
                  <td className="num text-right text-ink-2">{tk("sample.list.qty", { n: r.items.reduce((s, i) => s + i.qty, 0) })}</td>
                  <td className="num text-right">₩{krw(r.logistics_fee_krw)}</td>
                  <td className="text-meta">
                    {r.payment_confirmed_at ? <span className="text-signature">{tk("admin.samples.paymentConfirmed")}</span>
                      : r.payment_reported_at ? <span className="rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">{tk("admin.samples.reported")}</span>
                      : r.payment_required && r.status === "awaiting_payment" ? <span className="text-ink-2">{tk("admin.samples.paymentWaiting")}</span>
                      : !r.payment_required ? <span className="text-muted">{tk("admin.samples.paymentLater")}</span>
                      : <span className="text-muted">-</span>}
                  </td>
                  <td><StatusPill entity="sample_request" status={r.status} /></td>
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
