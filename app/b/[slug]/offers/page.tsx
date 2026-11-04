import Link from "next/link";
import { Suspense } from "react";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOffers, type BrandOffer } from "@/lib/db/brand/offers";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { exclusiveDday } from "@/lib/offers";
import { LinesheetCard } from "@/components/domain/linesheet-card";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { tk } from "@/lib/i18n";
import { ReactionButtons } from "./reaction-buttons";
import { matches, type ListQuery } from "../_ui/list";

/**
 * B-04 내 요청에 온 제안 = 라인시트. 요청 → 항목별 묶음, 그다음 위아더 추천. 상품 그리드(도매몰)가 아니다 (기획서 §2·§12).
 * 탭(전체 / 새 제안 / 관심 / 보류 / 지난 제안)과 상품명·코드 검색은 이미 받은 내 제안 안에서만 거른다(카탈로그 검색 아님).
 * 모바일 우선: 2열, 카드에서 바로 관심/보류/거절.
 */
type Tab = "all" | "new" | "interested" | "hold" | "past";
const IN_TAB: Record<Tab, (o: BrandOffer) => boolean> = {
  all: (o) => o.status !== "expired",
  new: (o) => o.status === "new" || o.status === "reconsent_pending",
  interested: (o) => o.status === "interested",
  hold: (o) => o.status === "hold",
  past: (o) => o.status === "declined" || o.status === "expired",
};

export default async function OffersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListQuery> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, brand, member } = await requireBrandMember(slug);
  const data = await listBrandOffers(brand.id);
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const cover = (pid: string) => {
    const imgs = data.images.filter((i) => i.product_id === pid);
    return (imgs.find((i) => i.kind === "real") ?? imgs[0])?.storage_path ?? null;
  };
  const urls = await signedReadUrls("productImages", [...new Set(data.offers.map((o) => cover(o.product_id)).filter(Boolean) as string[])]);
  const now = new Date();
  const base = `/b/${slug}/offers`;

  const productOf = (o: BrandOffer) => data.products.find((x) => x.id === o.product_id);
  const searched = data.offers.filter((o) => matches(sp.q, productOf(o)?.name_ko, productOf(o)?.code));
  const tab: Tab = sp.tab && sp.tab in IN_TAB ? (sp.tab as Tab) : "all";
  const live = searched.filter(IN_TAB[tab]);
  const expired = tab === "all" ? searched.filter((o) => o.status === "expired") : [];
  const tabs = (["all", "new", "interested", "hold", "past"] as const).map((k) => ({
    key: k, label: tk(`linesheet.tab.${k}`), href: withQuery(base, { q: sp.q }, { tab: k === "all" ? null : k }), count: searched.filter(IN_TAB[k]).length,
    tone: k === "new" ? ("brand" as const) : undefined,
  }));

  const card = (o: BrandOffer) => {
    const p = productOf(o);
    if (!p) return null;
    const img = cover(o.product_id);
    return (
      <LinesheetCard
        key={o.id}
        href={`${base}/${o.id}`}
        image={img ? urls[img] : null}
        code={p.code}
        name={p.name_ko}
        colors={data.colors.filter((c) => c.product_id === p.id)}
        sizes={data.sizes.filter((s) => s.product_id === p.id).map((s) => s.label)}
        fabric={p.fabric ?? []}
        tiers={o.price_tiers}
        feeRate={o.fee_rate}
        verified={p.verified_in_person}
        recommend={o.type === "recommend"}
        dday={o.status === "new" ? exclusiveDday(o.exclusive_until, now) : null}
        statusLabel={o.status === "new" ? null : tk(`status.offer.${o.status}`)}
        tone={o.status === "reconsent_pending" ? "warn" : o.status === "interested" ? "brand" : o.status === "new" ? "new" : "default"}
      >
        <ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} />
      </LinesheetCard>
    );
  };

  const byItem = new Map<string, BrandOffer[]>();
  for (const o of live.filter((o) => o.request_item_id)) byItem.set(o.request_item_id!, [...(byItem.get(o.request_item_id!) ?? []), o]);
  const recommends = live.filter((o) => !o.request_item_id);
  const requests = data.requests.filter((r) => data.items.some((i) => i.request_id === r.id && byItem.has(i.id)));
  const grid = "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4";
  const nothing = !live.length && !expired.length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow={tk("eyebrow.offers")}
        title={tk("linesheet.title")}
        count={data.offers.filter((o) => o.status !== "expired").length}
        description={tk("linesheet.lead")}
        actions={data.offers.length > 0 ? <Link href={`${base}/print`} className="btn btn-secondary">{tk("linesheet.pdf")}</Link> : null}
      >
        {data.offers.length > 0 && (
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />
            <Suspense><SearchBox className="md:w-72" placeholder={tk("linesheet.searchPh")} label={tk("linesheet.searchPh")} /></Suspense>
          </div>
        )}
      </PageHeader>

      {data.offers.length === 0 ? (
        <EmptyState title={tk("linesheet.empty")} help={tk("linesheet.emptyHelp")} action={{ href: `/b/${slug}/requests/new`, label: tk("home.request") }} />
      ) : nothing ? (
        <EmptyState compact title={tk("list.emptyFiltered")} help={tk("list.emptyFilteredHelp")} action={{ href: base, label: tk("list.reset") }} />
      ) : null}

      {requests.map((r) => {
        const its = data.items.filter((i) => i.request_id === r.id && byItem.has(i.id)).sort((a, b) => a.seq - b.seq);
        const n = its.reduce((s, i) => s + byItem.get(i.id)!.length, 0);
        return (
          <section key={r.id} className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-3">
              <div className="min-w-0">
                <div className="eyebrow">{tk("linesheet.requestEyebrow")}</div>
                <h2 className="mt-1 text-h2 font-bold tracking-tight">{r.title ?? tk("request.untitled")}</h2>
              </div>
              <div className="flex items-center gap-3 text-meta text-ink-2">
                <span className="num">{tk("linesheet.count", { n })}</span>
                <Link href={`/b/${slug}/requests/${r.id}`} className="btn btn-ghost btn-sm">{tk("linesheet.toRequest")}</Link>
              </div>
            </header>
            {its.map((i) => (
              <div key={i.id}>
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="num text-h3 font-semibold leading-none text-ink">{String(i.seq).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 text-lead text-ink">{i.description}</span>
                  <span className="num shrink-0 rounded-full bg-sand px-2 py-0.5 text-caption text-ink-2">{tk("linesheet.count", { n: byItem.get(i.id)!.length })}</span>
                </div>
                <div className={grid}>{byItem.get(i.id)!.map(card)}</div>
              </div>
            ))}
          </section>
        );
      })}
      {recommends.length > 0 && (
        <section className="space-y-6">
          <header className="border-b border-ink pb-3">
            <div className="eyebrow text-signature">{tk("linesheet.recommend")}</div>
            <h2 className="mt-1 text-h2 font-bold tracking-tight">{tk("linesheet.recommendTitle")}</h2>
            <p className="mt-1 text-meta text-ink-2">{tk("linesheet.recommendHelp")}</p>
          </header>
          <div className={grid}>{recommends.map(card)}</div>
        </section>
      )}
      {expired.length > 0 && (
        <details className="group border-t border-line pt-4">
          <summary className="cursor-pointer list-none text-body font-medium text-ink-2 hover:text-ink">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
            {tk("linesheet.expired", { n: expired.length })}
          </summary>
          <div className={`${grid} mt-6 opacity-60`}>{expired.map(card)}</div>
        </details>
      )}
    </div>
  );
}
