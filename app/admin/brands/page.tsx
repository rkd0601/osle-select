import Link from "next/link";
import { listBrandsForAdmin } from "@/lib/db/admin/brands";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { QuerySelect } from "../_ui/query-select";
import { ListEmpty, Toolbar, matchQ, sp, type SearchParams } from "../_ui/ui";
import { ApplicationList } from "./brand-controls";

/**
 * A-07 브랜드 관리: 대기 중 신청(승인·반려, 항상 맨 위) + 브랜드 목록(등급·수수료·숨은 마진·크레딧·멤버).
 * 목록 탭 = 전체 / 활성 / 정지 / 주소 변경 요청, 검색(이름·주소) + 등급 필터.
 */
const TABS = ["all", "active", "suspended", "slug"] as const;
type Tab = (typeof TABS)[number];

export default async function AdminBrands({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp(p.tab) ?? "") ? (sp(p.tab) as Tab) : "all";
  const q = sp(p.q);
  const tier = sp(p.tier);
  const { brands, applications } = await listBrandsForAdmin();
  const pct = (v: number | string | null) => (v == null ? <span className="text-muted">{tk("admin.brands.default")}</span> : `${Math.round(Number(v) * 1000) / 10}%`);
  const scoped = brands.filter((b) => (!tier || b.tier === tier) && matchQ(q, b.name, b.slug));
  const inTab = (t: Tab) => (t === "all" ? scoped : t === "slug" ? scoped.filter((b) => b.slugPending) : scoped.filter((b) => b.status === t));
  const rows = inTab(tab);
  const cur = { tab: tab === "all" ? undefined : tab, q, tier };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={tk("admin.nav.group.manage")} title={tk("admin.nav.brands")} count={brands.length} description={tk("admin.brands.lead")} />

      {/* 항상 렌더 — 승인 직후 초대 링크를 붙잡아 두려면 목록 컴포넌트가 남아 있어야 한다 */}
      <ApplicationList apps={applications.map((a) => ({ ...a, channels: (Array.isArray(a.channels) ? a.channels : []) as string[] }))} />

      <section>
        <div className="mb-4">
          <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
            tabs={TABS.map((t) => ({ key: t, label: t === "all" ? tk("admin.ui.all") : t === "slug" ? tk("admin.brands.tab.slug") : tk(`admin.brands.status.${t}`), count: inTab(t).length, tone: t === "slug" ? "warn" : "default", href: withQuery("/admin/brands", cur, { tab: t === "all" ? null : t }) }))} />
        </div>
        <Toolbar>
          <SearchBox className="w-full max-w-sm" placeholder={tk("admin.brands.searchPh")} label={tk("admin.ui.search")} />
          <QuerySelect param="tier" label={tk("admin.brands.tierFilter")} allLabel={tk("admin.brands.allTiers")} options={["new", "proven"].map((t) => ({ value: t, label: tk(`admin.brands.tier.${t}`) }))} />
        </Toolbar>
        {rows.length === 0 ? (
          <ListEmpty filtered={!!(q || tier)} resetHref={withQuery("/admin/brands", { tab: cur.tab }, {})} title={tk("admin.brands.empty")} help={tk("admin.brands.emptyHelp")} />
        ) : (
          <table className="table-ui">
            <thead>
              <tr>
                <th>{tk("admin.brands.name")}</th>
                <th>{tk("admin.brands.tier")}</th>
                <th className="text-right">{tk("admin.brands.fee")}</th>
                <th className="text-right">{tk("admin.brands.margin")}</th>
                <th className="text-right">{tk("admin.brands.credit")}</th>
                <th className="text-right">{tk("admin.brands.members")}</th>
                <th>{tk("admin.brands.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/brands/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                    <div className="num mt-0.5 text-caption text-muted">
                      /{b.slug}
                      {b.slugPending && <span className="ml-2 font-semibold text-warn">{tk("admin.brands.tab.slug")}</span>}
                    </div>
                  </td>
                  <td><span className={`rounded-full px-2 py-0.5 text-caption font-medium ${b.tier === "proven" ? "bg-signature-soft text-signature" : "bg-sand text-ink-2"}`}>{tk(`admin.brands.tier.${b.tier}`)}</span></td>
                  <td className="num text-right">{pct(b.fee_rate)}</td>
                  <td className="num text-right">{pct(b.hidden_margin_rate)}</td>
                  <td className={`num text-right ${b.credit_balance_krw ? "font-semibold" : "text-muted"}`}>₩{krw(b.credit_balance_krw)}</td>
                  <td className="num text-right">{b.members}</td>
                  <td>
                    <span className={b.status === "suspended" ? "font-semibold text-crit" : "text-ink-2"}>{tk(`admin.brands.status.${b.status}`)}</span>
                    {b.approved_at && <span className="num ml-1.5 text-caption text-muted">{fmtDate(b.approved_at)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
