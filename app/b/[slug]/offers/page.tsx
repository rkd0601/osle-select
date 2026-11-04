import Link from "next/link";
import { Suspense } from "react";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOffers, type BrandOffer } from "@/lib/db/brand/offers";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { exclusiveDday } from "@/lib/offers";
import { fmtDate } from "@/lib/format";
import { LinesheetCard } from "@/components/domain/linesheet-card";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { tk } from "@/lib/i18n";
import { ReactionButtons } from "./reaction-buttons";
import { matches, SEARCH_FROM, type ListQuery } from "../_ui/list";

/**
 * B-04 제안 = 라인시트 (디자인 v2 §5). 머리: 눈썹 "Linesheet · 브랜드", "제안 n", 한 문장, 오른쪽 "라인시트 PDF"(보조) + "샘플 요청서 담기 n"(주).
 * 요청별 섹션(요청명 · 항목 · 독점 기한) → `.sheet` 3칸(모바일 2칸) 라인시트 카드, 그다음 위아더 추천. 상품 그리드(도매몰)가 아니다.
 * 탭(전체 / 새 제안 / 관심 / 보류 / 지난 제안)과 검색은 제안 20건 이상일 때만 — 이미 받은 내 제안 안에서만 거른다.
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
  const liveTotal = data.offers.filter((o) => o.status !== "expired").length;
  const filters = liveTotal >= SEARCH_FROM;

  const productOf = (o: BrandOffer) => data.products.find((x) => x.id === o.product_id);
  const searched = filters ? data.offers.filter((o) => matches(sp.q, productOf(o)?.name_ko, productOf(o)?.code)) : data.offers;
  const tab: Tab = filters && sp.tab && sp.tab in IN_TAB ? (sp.tab as Tab) : "all";
  const live = searched.filter(IN_TAB[tab]);
  const expired = tab === "all" ? searched.filter((o) => o.status === "expired") : [];
  const tabs = (["all", "new", "interested", "hold", "past"] as const).map((k) => ({
    key: k, label: tk(`linesheet.tab.${k}`), href: withQuery(base, { q: sp.q }, { tab: k === "all" ? null : k }), count: searched.filter(IN_TAB[k]).length,
  }));
  // 샘플 요청서에 담을 수 있는 제안(관심·보류) — B-06이 같은 조건으로 다시 거른다
  const toSample = data.offers.filter((o) => o.status === "interested" || o.status === "hold");

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
        statusLabel={o.status === "new" || o.status === "interested" ? null : tk(`status.offer.${o.status}`)}
        tone={o.status === "reconsent_pending" ? "warn" : "default"}
      >
        <ReactionButtons card brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} />
      </LinesheetCard>
    );
  };

  const byItem = new Map<string, BrandOffer[]>();
  for (const o of live.filter((o) => o.request_item_id)) byItem.set(o.request_item_id!, [...(byItem.get(o.request_item_id!) ?? []), o]);
  const recommends = live.filter((o) => !o.request_item_id);
  const requests = data.requests.filter((r) => data.items.some((i) => i.request_id === r.id && byItem.has(i.id)));
  const nothing = !live.length && !expired.length;
  // 섹션 머리 오른쪽: 이 묶음에서 가장 빠른 독점 기한
  const exclusiveOf = (os: BrandOffer[]) => (os.filter((o) => o.status === "new").map((o) => o.exclusive_until).filter(Boolean) as string[]).sort()[0] ?? null;

  return (
    <div>
      <PageHeader
        eyebrow={`${tk("eyebrow.offers")} · ${brand.name}`}
        title={tk("linesheet.title")}
        count={liveTotal}
        description={liveTotal ? tk("linesheet.lead") : null}
        actions={data.offers.length > 0 ? (
          <>
            <Link href={`${base}/print`} className="btn sec">{tk("linesheet.pdf")}</Link>
            {toSample.length > 0 && (
              <Link href={`/b/${slug}/samples/new?offers=${toSample.map((o) => o.id).join(",")}`} className="btn">
                {tk("linesheet.toSample")} <span className="num">{toSample.length}</span>
              </Link>
            )}
          </>
        ) : null}
      >
        {filters && (
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />
            <Suspense><SearchBox className="md:w-72" placeholder={tk("linesheet.searchPh")} label={tk("linesheet.searchPh")} /></Suspense>
          </div>
        )}
      </PageHeader>

      {data.offers.length === 0 ? (
        <EmptyState title={tk("linesheet.empty")} action={{ href: `/b/${slug}/requests/new`, label: tk("home.request") }} />
      ) : nothing ? (
        <EmptyState compact title={tk("list.emptyFiltered")} action={{ href: base, label: tk("list.reset") }} />
      ) : null}

      {requests.map((r) => {
        const its = data.items.filter((i) => i.request_id === r.id && byItem.has(i.id)).sort((a, b) => a.seq - b.seq);
        return its.map((i, k) => {
          const os = byItem.get(i.id)!;
          const ex = exclusiveOf(os);
          return (
            <section key={i.id} className="section" style={k === 0 ? { paddingTop: 28 } : undefined}>
              <div className="section-h">
                <h2 className="min-w-0">
                  <Link href={`/b/${slug}/requests/${r.id}`} className="hover:underline hover:underline-offset-4">{r.title ?? tk("request.untitled")}</Link>
                  <span className="count">{tk("linesheet.itemMeta", { n: String(i.seq).padStart(2, "0"), desc: i.description })}</span>
                </h2>
                {ex && <span className="meta num shrink-0">{tk("linesheet.exclusiveUntil", { date: fmtDate(ex) })}</span>}
              </div>
              <div className="sheet">{os.map(card)}</div>
            </section>
          );
        });
      })}
      {recommends.length > 0 && (
        <section className="section">
          <div className="section-h">
            <h2>{tk("linesheet.recommendTitle")}<span className="count">{tk("linesheet.recommendHelp")}</span></h2>
          </div>
          <div className="sheet">{recommends.map(card)}</div>
        </section>
      )}
      {expired.length > 0 && (
        <details className="section group">
          <summary className="section-h cursor-pointer list-none">
            <h2 className="text-ink-2">{tk("linesheet.expired", { n: expired.length })}</h2>
          </summary>
          <div className="sheet opacity-60">{expired.map(card)}</div>
        </details>
      )}
    </div>
  );
}
