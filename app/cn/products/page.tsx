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

/**
 * C-04 내 상품 · 상태. 반려 사유는 템플릿 문구(zh/ko), 재확인 사유 표시. 빠른 수정은 C-03으로.
 * 탭 건수를 내려고 목록(최근 200건, 권한 필터는 listMyProducts 그대로)을 한 번 받아 코드로 거른다.
 * 디자인 v2: 760 안에서 사진 2칸(.photo 3:4 + 코드 태그) · 상태 점 · 읽기 전용 칩 · 반려/재확인 사유 warn 한 줄.
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

  /** 반려·재확인 사유 — warn 한 줄(넘치면 말줄임, 전체는 title) */
  const callout = (p: (typeof rows)[number]) => {
    const text =
      p.status === "rejected" && p.rejected_reasons?.length > 0 ? `${t(L, "product.list.rejected")}: ${p.rejected_reasons.map(reason).join(" · ")}`
      : p.status === "recheck" && p.recheck_reason ? t(L, "product.list.recheck", { reason: p.recheck_reason.split(",").map((f: string) => tv(L, `product.field.${f}`)).join(" · ") })
      : null;
    return text ? <p className="mt-1.5 truncate text-meta text-warn" title={text}>{text}</p> : null;
  };
  const title = (p: (typeof rows)[number]) => p.name_zh || p.code || p.id.slice(0, 8);
  const readOnlyChip = (p: (typeof rows)[number]) => (p.readOnly ? <span className="chip">{t(L, "product.readOnly.badge")}</span> : null);
  const meta = (p: (typeof rows)[number]) => [p.category, t(L, "product.list.photos", { n: p.photoCount }), t(L, "cn.products.updated", { date: fmtDate(p.updated_at, L) })].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader
        title={t(L, "product.list.title")}
        count={all.length}
        actions={<Link href="/cn/products/new" className="btn sec sm min-h-10">{t(L, "cn.nav.new")}</Link>}
      />

      <FilterTabs
        label={t(L, "cn.filter.label")}
        active={filter ?? ""}
        tabs={TABS.map((tab) => ({ key: tab, label: tab ? t(L, `status.product.${tab}`) : t(L, "product.list.all"), href: href({ status: tab || undefined }), count: count(tab) }))}
      />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <SearchBox placeholder={t(L, "cn.products.search")} label={t(L, "cn.search.label")} className="w-full sm:max-w-xs" />
        <nav aria-label={t(L, "cn.products.view.label")} className="flex gap-5 text-meta">
          {([["grid", t(L, "cn.products.view.grid"), href({ view: undefined })], ["list", t(L, "cn.products.view.list"), href({ view: "list" })]] as const).map(([k, label, to]) => (
            <Link key={k} href={to} aria-current={view === k ? "true" : undefined}
              className={`inline-flex min-h-10 items-center border-b ${view === k ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>{label}</Link>
          ))}
        </nav>
      </div>

      {all.length === 0 ? (
        <EmptyState title={t(L, "product.list.empty")} action={{ href: "/cn/products/new", label: t(L, "cn.nav.new") }} />
      ) : rows.length === 0 ? (
        <EmptyState compact title={t(L, "cn.filter.empty")} action={{ href: "/cn/products", label: t(L, "cn.filter.reset") }} />
      ) : view === "grid" ? (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6">
          {rows.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link href={`/cn/products/${p.id}`} className="group block">
                <Photo src={p.cover ? covers[p.cover] : null} label={p.code ?? null} className="transition-opacity group-hover:opacity-90" />
                <div className="mt-3 truncate text-lead font-medium group-hover:underline">{title(p)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StatusPill entity="product" status={p.status} locale={L} />
                  {readOnlyChip(p)}
                </div>
                <div className="num mt-1 truncate text-caption text-muted">{meta(p)}</div>
                {callout(p)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-6 border-t border-line">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/cn/products/${p.id}`} className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-4 border-b border-line py-3 hover:bg-[linear-gradient(90deg,var(--surface),transparent)] sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center">
                <Photo src={p.cover ? covers[p.cover] : null} />
                <div className="min-w-0">
                  <div className="truncate text-lead font-medium">{title(p)}</div>
                  <div className="num mt-0.5 truncate text-caption text-muted">{[p.code, meta(p)].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 empty:hidden">
                    <span className="sm:hidden"><StatusPill entity="product" status={p.status} locale={L} /></span>
                    {readOnlyChip(p)}
                  </div>
                  {callout(p)}
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
