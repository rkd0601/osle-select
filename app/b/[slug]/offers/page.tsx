import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOffers, type BrandOffer } from "@/lib/db/brand/offers";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { exclusiveDday } from "@/lib/offers";
import { LinesheetCard } from "@/components/domain/linesheet-card";
import { tk } from "@/lib/i18n";
import { ReactionButtons } from "./reaction-buttons";

/**
 * B-04 내 요청에 온 제안 = 라인시트. 요청 → 항목별 묶음, 그다음 위아더 추천. 검색창·상품 그리드 없음 (기획서 §2·§12).
 * 모바일 우선: 2열, 카드에서 바로 관심/보류/거절.
 */
export default async function OffersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, brand, member } = await requireBrandMember(slug);
  const data = await listBrandOffers(brand.id);
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const cover = (pid: string) => {
    const imgs = data.images.filter((i) => i.product_id === pid);
    return (imgs.find((i) => i.kind === "real") ?? imgs[0])?.storage_path ?? null;
  };
  const urls = await signedReadUrls("productImages", [...new Set(data.offers.map((o) => cover(o.product_id)).filter(Boolean) as string[])]);
  const now = new Date();
  const live = data.offers.filter((o) => o.status !== "expired");
  const expired = data.offers.filter((o) => o.status === "expired");

  const card = (o: BrandOffer) => {
    const p = data.products.find((x) => x.id === o.product_id);
    if (!p) return null;
    const img = cover(o.product_id);
    return (
      <LinesheetCard
        key={o.id}
        href={`/b/${slug}/offers/${o.id}`}
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
        statusLabel={o.status === "reconsent_pending" ? tk("status.offer.reconsent_pending") : null}
      >
        <ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} />
      </LinesheetCard>
    );
  };

  const byItem = new Map<string, BrandOffer[]>();
  for (const o of live.filter((o) => o.request_item_id)) byItem.set(o.request_item_id!, [...(byItem.get(o.request_item_id!) ?? []), o]);
  const recommends = live.filter((o) => !o.request_item_id);
  const requests = data.requests.filter((r) => data.items.some((i) => i.request_id === r.id && byItem.has(i.id)));
  const grid = "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-12">
      <div className="flex items-end justify-between border-b border-ink pb-3">
        <h1 className="text-[28px] font-bold tracking-tight">{tk("linesheet.title")}</h1>
        {data.offers.length > 0 && <Link href={`/b/${slug}/offers/print`} className="text-[12px] text-ink-2 underline-offset-4 hover:underline">{tk("linesheet.pdf")}</Link>}
      </div>
      {live.length === 0 && <p className="py-16 text-center text-[14px] text-muted">{tk("linesheet.empty")}</p>}
      {requests.map((r) => (
        <section key={r.id} className="space-y-8">
          <h2 className="text-[18px] font-bold">{r.title}</h2>
          {data.items.filter((i) => i.request_id === r.id && byItem.has(i.id)).sort((a, b) => a.seq - b.seq).map((i) => (
            <div key={i.id}>
              <div className="mb-3 flex items-baseline gap-3 border-t border-line pt-3">
                <span className="num text-[13px] font-semibold">{tk("request.item", { n: String(i.seq).padStart(2, "0") })}</span>
                <span className="text-[14px]">{i.description}</span>
                <span className="num ml-auto text-[12px] text-muted">{tk("linesheet.count", { n: byItem.get(i.id)!.length })}</span>
              </div>
              <div className={grid}>{byItem.get(i.id)!.map(card)}</div>
            </div>
          ))}
        </section>
      ))}
      {recommends.length > 0 && (
        <section className="space-y-3">
          <h2 className="border-t border-ink pt-3 text-[18px] font-bold">{tk("linesheet.recommendTitle")}</h2>
          <p className="text-[12px] text-muted">{tk("linesheet.recommendHelp")}</p>
          <div className={grid}>{recommends.map(card)}</div>
        </section>
      )}
      {expired.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] text-ink-2">{tk("linesheet.expired", { n: expired.length })}</summary>
          <div className={`${grid} mt-4 opacity-60`}>{expired.map(card)}</div>
        </details>
      )}
    </div>
  );
}
