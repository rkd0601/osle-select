import Link from "next/link";
import { listProductsForAdmin, offerStatsByProduct } from "@/lib/db/admin/products";
import { signedReadUrls } from "@/lib/storage";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { StatusPill } from "@/components/domain/status-pill";
import { Photo } from "@/components/domain/photo";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { ListEmpty, TBL, Toolbar, matchQ, sp, type SearchParams } from "../_ui/ui";

const TABS = ["all", "reviewed", "offering", "repool"] as const;

/**
 * A-04 제안 발행 · 상품 관리: 검수완료(발행 대기)·제안중·재제안 풀 상품. 탭(건수) + 검색(코드·상품명·원청).
 * 상품별 발행 제안 수·관심 수만 보여 준다(가격·원가 없음). 레이아웃이 ADMIN을 검증한다.
 */
export default async function AdminOffers({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp(p.tab) ?? "") ? (sp(p.tab) as (typeof TABS)[number]) : "all";
  const q = sp(p.q);
  const all = await listProductsForAdmin(["reviewed", "repool", "offering"], 500);
  const scoped = all.filter((r) => matchQ(q, r.code, r.name_ko, r.name_zh, r.vendorName, r.category));
  const inTab = (t: string) => (t === "all" ? scoped : scoped.filter((r) => r.status === t));
  const rows = inTab(tab);
  const [covers, stats] = await Promise.all([
    signedReadUrls("productImages", rows.flatMap((r) => (r.cover ? [r.cover] : []))),
    offerStatsByProduct(rows.map((r) => r.id)),
  ]);
  const cur = { tab: tab === "all" ? undefined : tab, q };

  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.sourcing")} title={tk("issue.title")} count={all.length}
        actions={<Link href="/admin/products" className="link">{tk("admin.offers.toReview")}</Link>}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
          tabs={TABS.map((t) => ({ key: t, label: t === "all" ? tk("admin.ui.all") : tk(`admin.offers.tab.${t}`), count: inTab(t).length, tone: t === "reviewed" ? "brand" : "default", href: withQuery("/admin/offers", cur, { tab: t === "all" ? null : t }) }))} />
      </PageHeader>
      <Toolbar>
        <SearchBox className="w-full max-w-sm" placeholder={tk("admin.products.searchPh")} label={tk("admin.ui.search")} />
      </Toolbar>
      {rows.length === 0 ? (
        <ListEmpty filtered={!!q} resetHref={withQuery("/admin/offers", { tab: cur.tab }, {})} title={tk("issue.empty")} />
      ) : (
        <table className={TBL}>
          <thead>
            <tr>
              <th>{tk("admin.products.col.product")}</th>
              <th>{tk("admin.products.col.vendor")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th className="r">{tk("admin.offers.col.offers")}</th>
              <th className="r">{tk("admin.offers.col.interested")}</th>
              <th className="r">{tk("admin.offers.col.updated")}</th>
              <th><span className="sr-only">{tk("admin.ui.nextAction")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = stats.get(r.id);
              return (
                <tr key={r.id}>
                  <td className="min-w-0">
                    <Link href={`/admin/offers/${r.id}`} className="group flex items-center gap-4">
                      <span className="w-10 shrink-0"><Photo src={r.cover ? covers[r.cover] : null} /></span>
                      <span className="min-w-0">
                        <span className="code">{r.code ?? "—"}{r.category ? ` · ${r.category}` : ""}</span>
                        <span className="block truncate font-medium group-hover:text-signature">{r.name_ko || r.name_zh}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-ink-2">{r.vendorName ?? "-"}</td>
                  <td><StatusPill entity="product" status={r.status} /></td>
                  <td className="r">{s?.total ?? 0}{s?.live ? <span className="ml-1.5 text-caption text-muted">{tk("admin.offers.live", { n: s.live })}</span> : null}</td>
                  <td className={`r ${s?.interested ? "font-medium" : "text-muted"}`}>{s?.interested ?? 0}</td>
                  <td className="r text-meta text-muted">{fmtDate(r.updated_at)}</td>
                  <td className="text-right">
                    <Link href={`/admin/offers/${r.id}`} className={`btn sm ${r.status === "reviewed" ? "" : "sec"}`}>{tk(r.status === "reviewed" ? "admin.offers.issue" : "admin.ui.open")}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
