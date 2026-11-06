import Link from "next/link";
import { listSamplesForAdmin } from "@/lib/db/admin/samples";
import { returnOverdue, sampleDecision } from "@/lib/samples";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { QuerySelect } from "../_ui/query-select";
import { Due, ListEmpty, TBL, Toolbar, brandOptions, matchQ, sp, type SearchParams } from "../_ui/ui";

/**
 * A-05 샘플 관리 큐 v2(d-26·d-27, NEXT §0-l S7): 탭 = 전체 / 중국 출고 / 위아더 도착·검품 / 브랜드 발송·피드백·결정 / **결정 기한 경과**.
 * 입금 단계 없음 — 열 = 물류비(후불) · 결정(돌려보냄/구매/대기) · 기한. (0058 전 입금 대기 행은 "전체"에만 보인다)
 * 검색(브랜드) + 브랜드 필터. 레이아웃이 ADMIN을 검증한다.
 */
const TABS = ["all", "cn", "inspect", "brand", "overdue"] as const;
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
      <PageHeader eyebrow={tk("admin.nav.group.deals")} title={tk("admin.samples.title")} count={all.length}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
          tabs={TABS.map((t) => ({ key: t, label: t === "all" ? tk("admin.ui.all") : tk(`admin.samples.section.${t}`), count: inTab(t).length, tone: t === "overdue" ? "warn" : "default", href: withQuery("/admin/samples", cur, { tab: t === "all" ? null : t }) }))} />
      </PageHeader>
      <Toolbar>
        <SearchBox className="w-full max-w-sm" placeholder={tk("admin.samples.searchPh")} label={tk("admin.ui.search")} />
        <QuerySelect param="brand" label={tk("admin.ui.brandFilter")} allLabel={tk("admin.ui.allBrands")} options={brandOptions(all.map((r) => one(r.brands) ?? {}))} />
      </Toolbar>
      {rows.length === 0 ? (
        <ListEmpty filtered={!!(q || brand)} resetHref={withQuery("/admin/samples", { tab: cur.tab }, {})} title={tk("admin.samples.empty")} />
      ) : (
        <table className={TBL}>
          <thead>
            <tr>
              <th>{tk("admin.samples.col.request")}</th>
              <th className="r">{tk("admin.samples.col.qty")}</th>
              <th className="r">{tk("admin.samples.col.logisticsLater")}</th>
              <th>{tk("admin.samples.col.decision")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th className="r">{tk("admin.requests.col.due")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = one(r.brands);
              const returnLate = r.items.some((i) => returnOverdue(i, r.return_due, now));
              // 결정 = 받은 뒤 항목별 돌려보냄 · 반납 중 · 구매 · 대기 (받기 전이면 "-")
              const got = ["delivered", "feedback_done", "closed"].includes(r.status) ? r.items.filter((i) => i.status !== "unavailable") : [];
              const decisions = [...got.reduce((m, i) => m.set(sampleDecision(i), (m.get(sampleDecision(i)) ?? 0) + 1), new Map<string, number>())];
              return (
                <tr key={r.id}>
                  <td>
                    <span className="code">#{r.id.slice(0, 4).toUpperCase()} · {tk("admin.samples.requestedAt", { date: fmtDate(r.created_at) })}</span>
                    <Link href={`/admin/samples/${r.id}`} className="font-medium hover:text-signature">{b?.name ?? "-"}</Link>
                    {returnLate && <span className="ml-2 text-meta font-medium text-crit">{tk("admin.samples.overdue")}</span>}
                  </td>
                  <td className="r text-ink-2">{tk("sample.list.qty", { n: r.items.reduce((s, i) => s + i.qty, 0) })}</td>
                  <td className="r">₩{krw(r.logistics_fee_krw)}</td>
                  <td className="text-meta">
                    {decisions.length === 0 ? <span className="text-muted">-</span>
                      : decisions.map(([d, n]) => (
                        <span key={d} className={`st ${d === "pending" ? "wait" : d === "purchased" ? "warn" : "done"} mr-3`}>{tk(`admin.samples.decision.${d}`)}{got.length > 1 ? ` ${n}` : ""}</span>
                      ))}
                  </td>
                  <td><StatusPill entity="sample_request" status={r.status} /></td>
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
