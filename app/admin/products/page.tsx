import Link from "next/link";
import { listProductsForAdmin } from "@/lib/db/admin/products";
import { signedReadUrls } from "@/lib/storage";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { StatusPill } from "@/components/domain/status-pill";
import { Photo } from "@/components/domain/photo";
import { tk } from "@/lib/i18n/admin";
import { QuerySelect } from "../_ui/query-select";
import { Due, ListEmpty, TBL, Toolbar, matchQ, sp, type SearchParams } from "../_ui/ui";

const TABS = [
  ["queue", ["pending_review", "recheck"]],
  ["reviewed", ["reviewed", "repool"]],
  ["offering", ["offering"]],
  ["rejected", ["rejected", "hidden"]],
] as const;
const ALL = TABS.flatMap(([, s]) => [...s]);

/**
 * A-03 상품 검수 큐: 검수 대기 + 재확인, 기한 순(지연 먼저). 탭(건수) + 검색(코드·상품명·원청) + 카테고리 필터.
 * 레이아웃이 ADMIN을 검증한다. 네 탭의 상품을 한 번 읽어 건수·필터를 메모리에서 계산한다.
 */
export default async function AdminProducts({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const current = TABS.find(([k]) => k === sp(p.tab)) ?? TABS[0];
  const q = sp(p.q);
  const cat = sp(p.cat);
  const now = new Date();
  const all = await listProductsForAdmin(ALL, 500);
  const scoped = all.filter((r) => (!cat || r.category === cat) && matchQ(q, r.code, r.name_ko, r.name_zh, r.vendorName, r.category));
  const inTab = (statuses: readonly string[]) => scoped.filter((r) => statuses.includes(r.status));
  const rows = inTab(current[1]);
  const covers = await signedReadUrls("productImages", rows.flatMap((r) => (r.cover ? [r.cover] : [])));
  const cats = [...new Set(all.map((r) => r.category).filter(Boolean) as string[])].sort().map((c) => ({ value: c, label: c }));
  const cur = { tab: current[0] === "queue" ? undefined : current[0], q, cat };
  const queueCount = inTab(TABS[0][1]).length;

  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.sourcing")} title={tk("review.title")} count={queueCount}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={current[0]}
          tabs={TABS.map(([k, s]) => ({ key: k, label: tk(`review.tab.${k}`), count: inTab(s).length, tone: k === "queue" ? "warn" : "default", href: withQuery("/admin/products", cur, { tab: k === "queue" ? null : k }) }))} />
      </PageHeader>
      <Toolbar>
        <SearchBox className="w-full max-w-sm" placeholder={tk("admin.products.searchPh")} label={tk("admin.ui.search")} />
        {cats.length > 1 && <QuerySelect param="cat" label={tk("admin.products.catFilter")} allLabel={tk("admin.products.allCats")} options={cats} />}
      </Toolbar>
      {rows.length === 0 ? (
        <ListEmpty filtered={!!(q || cat)} resetHref={withQuery("/admin/products", { tab: cur.tab }, {})} title={tk("review.empty")} />
      ) : (
        <table className={TBL}>
          <thead>
            <tr>
              <th>{tk("admin.products.col.product")}</th>
              <th>{tk("admin.products.col.category")}</th>
              <th>{tk("admin.products.col.vendor")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th className="r">{tk("admin.requests.col.due")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="min-w-0">
                  <Link href={`/admin/products/${r.id}`} className="group flex items-center gap-4">
                    <span className="w-10 shrink-0"><Photo src={r.cover ? covers[r.cover] : null} /></span>
                    <span className="min-w-0">
                      <span className="code">{r.code ?? "—"}</span>
                      <span className="block truncate font-medium group-hover:text-signature">{r.name_ko || r.name_zh || r.id.slice(0, 8)}</span>
                      {r.status === "recheck" && r.recheck_reason && (
                        <span className="block text-caption text-warn">{tk("review.recheckFields")}: {r.recheck_reason.split(",").map((f: string) => tk(`product.field.${f}`)).join(" · ")}</span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="text-ink-2">{r.category ?? "-"}</td>
                <td className="text-ink-2">
                  {r.vendorName ?? "-"}
                  {r.trustScore != null && <span className="num ml-2 text-caption text-muted">{tk("admin.vendors.trust")} {r.trustScore}</span>}
                </td>
                <td><StatusPill entity="product" status={r.status} /></td>
                <td className="r"><Due at={r.due_at} now={now} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
