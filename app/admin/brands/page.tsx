import Link from "next/link";
import { listBrandsForAdmin } from "@/lib/db/admin/brands";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { QuerySelect } from "../_ui/query-select";
import { ListEmpty, TBL, Toolbar, matchQ, sp, type SearchParams } from "../_ui/ui";
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
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.manage")} title={tk("admin.nav.brands")} count={brands.length} />

      {/* 항상 렌더 — 승인 직후 초대 링크를 붙잡아 두려면 목록 컴포넌트가 남아 있어야 한다 */}
      <ApplicationList apps={applications.map((a) => ({ ...a, channels: (Array.isArray(a.channels) ? a.channels : []) as string[] }))} />

      <section className="pt-12 [&:nth-child(2)]:pt-0">
        <div className="mb-6">
          <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
            tabs={TABS.map((t) => ({ key: t, label: t === "all" ? tk("admin.ui.all") : t === "slug" ? tk("admin.brands.tab.slug") : tk(`admin.brands.status.${t}`), count: inTab(t).length, tone: t === "slug" ? "warn" : "default", href: withQuery("/admin/brands", cur, { tab: t === "all" ? null : t }) }))} />
        </div>
        <Toolbar>
          <SearchBox className="w-full max-w-sm" placeholder={tk("admin.brands.searchPh")} label={tk("admin.ui.search")} />
          <QuerySelect param="tier" label={tk("admin.brands.tierFilter")} allLabel={tk("admin.brands.allTiers")} options={["new", "proven"].map((t) => ({ value: t, label: tk(`admin.brands.tier.${t}`) }))} />
        </Toolbar>
        {rows.length === 0 ? (
          <ListEmpty filtered={!!(q || tier)} resetHref={withQuery("/admin/brands", { tab: cur.tab }, {})} title={tk("admin.brands.empty")} />
        ) : (
          <table className={TBL}>
            <thead>
              <tr>
                <th>{tk("admin.brands.name")}</th>
                <th>{tk("admin.brands.tier")}</th>
                <th className="r">{tk("admin.brands.fee")}</th>
                <th className="r">{tk("admin.brands.margin")}</th>
                <th className="r">{tk("admin.brands.credit")}</th>
                <th className="r">{tk("admin.brands.members")}</th>
                <th>{tk("admin.brands.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="code">/{b.slug}{b.slugPending && <span className="text-warn"> · {tk("admin.brands.tab.slug")}</span>}</span>
                    <Link href={`/admin/brands/${b.id}`} className="font-medium hover:text-signature">{b.name}</Link>
                  </td>
                  <td><span className={`chip ${b.tier === "proven" ? "ink" : ""}`}>{tk(`admin.brands.tier.${b.tier}`)}</span></td>
                  <td className="r">{pct(b.fee_rate)}</td>
                  <td className="r">{pct(b.hidden_margin_rate)}</td>
                  <td className={`r ${b.credit_balance_krw ? "" : "text-muted"}`}>₩{krw(b.credit_balance_krw)}</td>
                  <td className="r">{b.members}</td>
                  <td>
                    <span className={`st ${b.status === "suspended" ? "crit" : ""}`}>{tk(`admin.brands.status.${b.status}`)}</span>
                    {b.approved_at && <span className="num ml-2 text-caption text-muted">{fmtDate(b.approved_at)}</span>}
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
