import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyProducts } from "@/lib/db/cn/products";
import { getRejectionTemplates } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { Photo } from "@/components/domain/photo";
import { fmtDate } from "@/lib/format";
import { t, tFor } from "@/lib/i18n/cn";
import { PRODUCT_STATUS } from "@/lib/transitions";

const TABS = ["", "draft", "pending_review", "rejected", "reviewed", "offering", "repool", "recheck"] as const;
const WARN = new Set(["rejected", "recheck"]);

/**
 * C-04 내 상품 · 상태. 반려 사유는 템플릿 문구(zh/ko), 재확인 사유 표시. 빠른 수정은 C-03으로.
 * 탭 건수를 내려고 목록(최근 200건, 권한 필터는 listMyProducts 그대로)을 한 번 받아 코드로 거른다.
 */
export default async function CnProducts({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; view?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/products");
  const L = u.locale;
  const sp = await searchParams;
  const filter = (PRODUCT_STATUS as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const view = sp.view === "list" ? "list" : "grid";
  const q = (sp.q ?? "").trim().toLowerCase();
  const [all, templates] = await Promise.all([listMyProducts({ id: u.id, role: u.role }), getRejectionTemplates()]);
  const searched = q ? all.filter((p) => [p.name_zh, p.name_ko, p.code, p.category].some((v) => v && v.toLowerCase().includes(q))) : all;
  const rows = filter ? searched.filter((p) => p.status === filter) : searched;
  const covers = await signedReadUrls("productImages", rows.flatMap((r) => (r.cover ? [r.cover] : [])));
  const count = (s: string) => (s ? searched.filter((p) => p.status === s).length : searched.length);
  const reason = (code: string) => {
    const tpl = templates.find((x) => x.code === code);
    return tpl ? (L === "ko" ? tpl.ko : tpl.zh) : code;
  };
  const tv = tFor(u.role === "CN_VENDOR");
  const cur = { status: filter, q: sp.q, view: view === "list" ? "list" : undefined };
  const href = (patch: Record<string, string | undefined | null>) => withQuery("/cn/products", cur, patch);

  const callouts = (p: (typeof rows)[number]) => (
    <>
      {p.status === "rejected" && p.rejected_reasons?.length > 0 && (
        <p className="mt-2 border-l-2 border-warn pl-2 text-meta text-warn">{t(L, "product.list.rejected")}: {p.rejected_reasons.map(reason).join(" · ")}</p>
      )}
      {p.status === "recheck" && p.recheck_reason && (
        <p className="mt-2 border-l-2 border-warn pl-2 text-meta text-warn">{t(L, "product.list.recheck", { reason: p.recheck_reason.split(",").map((f: string) => tv(L, `product.field.${f}`)).join(" · ") })}</p>
      )}
    </>
  );
  const title = (p: (typeof rows)[number]) => p.name_zh || p.code || p.id.slice(0, 8);
  const readOnlyBadge = <span className="inline-flex rounded-full bg-sand px-2 py-0.5 text-caption font-medium text-ink-2">{t(L, "product.readOnly.badge")}</span>;

  return (
    <div>
      <PageHeader
        eyebrow={t(L, "cn.title")}
        title={t(L, "product.list.title")}
        count={all.length}
        description={t(L, "cn.products.desc")}
        actions={<Link href="/cn/products/new" className="btn btn-accent min-h-10">{t(L, "cn.nav.new")}</Link>}
      />

      <div className="space-y-3">
        <FilterTabs
          label={t(L, "cn.filter.label")}
          active={filter ?? ""}
          tabs={TABS.map((tab) => ({
            key: tab,
            label: tab ? t(L, `status.product.${tab}`) : t(L, "product.list.all"),
            href: href({ status: tab || undefined }),
            count: count(tab),
            tone: WARN.has(tab) ? "warn" : undefined,
          }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchBox placeholder={t(L, "cn.products.search")} label={t(L, "cn.search.label")} className="w-full sm:max-w-sm" />
          <nav aria-label={t(L, "cn.products.view.label")} className="flex gap-2">
            {([["grid", t(L, "cn.products.view.grid"), href({ view: undefined })], ["list", t(L, "cn.products.view.list"), href({ view: "list" })]] as const).map(([k, label, to]) => (
              <Link key={k} href={to} className="chip min-h-10" aria-current={view === k ? "true" : undefined}>{label}</Link>
            ))}
          </nav>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="mt-5"><EmptyState title={t(L, "product.list.empty")} help={t(L, "cn.products.empty.help")} action={{ href: "/cn/products/new", label: t(L, "cn.nav.new") }} /></div>
      ) : rows.length === 0 ? (
        <div className="mt-5"><EmptyState compact title={t(L, "cn.filter.empty")} action={{ href: "/cn/products", label: t(L, "cn.filter.reset") }} /></div>
      ) : view === "grid" ? (
        <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link href={`/cn/products/${p.id}`} className="group block">
                <div className="relative">
                  <Photo src={p.cover ? covers[p.cover] : null} label={p.code ?? null} className="transition-opacity group-hover:opacity-90" />
                  <span className="absolute left-2 top-2"><StatusPill entity="product" status={p.status} locale={L} /></span>
                  {p.photoCount > 0 && <span className="num absolute bottom-2 right-2 rounded-sm bg-ink/70 px-1.5 py-0.5 text-micro text-paper">{t(L, "product.list.photos", { n: p.photoCount })}</span>}
                </div>
                <div className="mt-2 border-t border-line pt-2">
                  <div className="truncate text-body font-semibold group-hover:underline">{title(p)}</div>
                  <div className="num mt-0.5 truncate text-caption text-muted">{[p.code, p.category, fmtDate(p.updated_at, L)].filter(Boolean).join(" · ")}</div>
                  {p.readOnly && <div className="mt-1.5">{readOnlyBadge}</div>}
                  {callouts(p)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-5 divide-y divide-line border-y border-line bg-surface">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/cn/products/${p.id}`} className="grid grid-cols-[56px_1fr] items-start gap-3 px-3 py-3 hover:bg-paper sm:grid-cols-[56px_1fr_auto] sm:items-center">
                <div className="w-14"><Photo src={p.cover ? covers[p.cover] : null} label={null} /></div>
                <div className="min-w-0 text-body">
                  <div className="truncate font-semibold">{title(p)}</div>
                  <div className="num text-caption text-muted">{[p.code, p.category, t(L, "product.list.photos", { n: p.photoCount }), t(L, "cn.products.updated", { date: fmtDate(p.updated_at, L) })].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="sm:hidden"><StatusPill entity="product" status={p.status} locale={L} /></span>
                    {p.readOnly && readOnlyBadge}
                  </div>
                  {callouts(p)}
                </div>
                <span className="hidden sm:block"><StatusPill entity="product" status={p.status} locale={L} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
