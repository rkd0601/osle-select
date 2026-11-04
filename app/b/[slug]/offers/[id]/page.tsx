import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandOffer } from "@/lib/db/brand/offers";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { exclusiveDday } from "@/lib/offers";
import { CARE, MATERIALS, MEASUREMENTS, ORIGINS, label } from "@/lib/codes";
import { PriceBreakdown } from "@/components/domain/price-breakdown";
import { Photo } from "@/components/domain/photo";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ReactionButtons } from "../reaction-buttons";
import { BackLink } from "../../_ui/list";

/**
 * B-05 상품 상세 (모바일 우선). 다른 브랜드 제안·없는 id·재확인 중(뷰가 가림) 모두 404.
 * 노출: 갤러리(실물컷 먼저) · 컬러칩 · 사이즈표(출처) · 혼용률·세탁·원산지 · 수량별 단가 + 수수료 내역 · 공급 형태 · 홀딩 · 샘플비(한 금액) · 옵션(KRW) · 허용 오차·물류 별도.
 * 데스크톱: 왼쪽 큰 사진 + 상세 정보, 오른쪽 가격·반응 칸이 따라온다(sticky). 모바일: 사진 → 가격 → 상세, 반응 버튼은 하단 고정.
 */
export default async function OfferDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand, member } = await requireBrandMember(slug);
  const data = await getBrandOffer(brand.id, id);
  if (!data) notFound();
  const { offer: o, product: p, images, colors, sizes } = data;
  const ordered = [...images].sort((a, b) => (a.kind === "real" ? -1 : b.kind === "real" ? 1 : a.sort_order - b.sort_order));
  const urls = await signedReadUrls("productImages", ordered.map((i) => i.storage_path));
  const parts = [...new Set(sizes.flatMap((s) => Object.keys(s.measurements ?? {})))];
  const dday = o.status === "new" ? exclusiveDday(o.exclusive_until, new Date()) : null;
  const hold = p.hold as { none?: boolean; deposit_pct?: number; days?: number } | null;
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const sampleTotal = (o.sample_logistics_krw ?? 0);
  const canSample = o.status === "interested" || o.status === "hold";

  return (
    <div className="pb-28 lg:pb-0">
      <BackLink href={`/b/${slug}/offers`} label={tk("nav.offers")} />
      <div className="mt-3 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* 갤러리 */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {ordered.length ? (
            <div className="grid grid-cols-2 gap-2">
              {ordered.map((i, k) => (
                // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                <img key={i.id} src={urls[i.storage_path]} alt={k === 0 ? (p.name_ko ?? "") : ""} className={`aspect-[3/4] w-full bg-well object-cover ${k === 0 ? "col-span-2" : ""}`} />
              ))}
            </div>
          ) : (
            <Photo src={null} label={p.code} alt={p.name_ko ?? ""} verified={p.verified_in_person ? tk("linesheet.verified") : null} />
          )}
        </div>

        {/* 가격·반응 (데스크톱 sticky) */}
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1">{p.code}</span>
              {o.type === "recommend" && <span className="chip">{tk("linesheet.recommend")}</span>}
              {dday !== null && <span className="chip">{tk("linesheet.dday", { n: dday })}</span>}
              {o.status !== "new" && <span className={`st ${o.status === "reconsent_pending" ? "warn" : ""}`}>{tk(`status.offer.${o.status}`)}</span>}
            </div>
            <h1 className="h1 mt-3">{p.name_ko}</h1>
            {p.desc_ko && <p className="mt-2 whitespace-pre-wrap text-lead text-ink-2">{p.desc_ko}</p>}
            {o.admin_comment && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="label">{tk("offer.detail.weareNote")}</div>
                <p className="mt-1 text-body">{o.admin_comment}</p>
              </div>
            )}
          </div>

          <section className="space-y-5 border border-line bg-surface p-6 sm:p-7">
            <PriceBreakdown tiers={o.price_tiers} feeRate={o.fee_rate} />
            <div className="hidden lg:block"><ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} /></div>
            <dl className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-line pt-3 text-meta">
              {o.sample_logistics_krw != null && (<>
                <dt className="text-ink-2">{tk("detail.sample")}</dt>
                <dd className="text-right text-ink">₩{krw(sampleTotal)}</dd>
              </>)}
              <dt className="text-ink-2">{tk("detail.valid")}</dt><dd className="text-right">{fmtDate(o.valid_until)}</dd>
              <dt className="text-ink-2">{tk("product.detail.minQty")}</dt><dd className="text-right">{p.min_qty}</dd>
            </dl>
            {o.sample_logistics_krw != null && <p className="text-caption text-muted">{tk("detail.sampleNote", { product: krw(o.sample_fee_product_krw ?? 0) })}</p>}
            {canSample ? (
              <Link href={`/b/${slug}/samples/new?offers=${o.id}`} className="btn lg w-full">{tk("offer.detail.toSample")}</Link>
            ) : (
              <p className="text-caption text-muted">{tk("detail.addToSampleHint")}</p>
            )}
          </section>
        </aside>

        {/* 상세 정보 */}
        <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
          {colors.length > 0 && (
            <section>
              <div className="section-h"><h2>{tk("offer.detail.colors")}<span className="count">{colors.length}</span></h2></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {colors.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-2 py-1 pr-4 text-body">
                    <span className="inline-block h-4 w-4 rounded-full border border-line-strong" style={{ background: c.hex ?? "transparent" }} />{c.name_ko}
                  </span>
                ))}
              </div>
            </section>
          )}

          {sizes.length > 0 && (
            <section>
              <div className="section-h"><h2>{tk("detail.sizeChart")}<span className="count">cm · {sizes.some((s) => s.source === "measured") ? tk("detail.measured") : tk("detail.vendorChart")}</span></h2></div>
              <div className="mt-4 max-w-full overflow-x-auto">
                <table className="tbl num">
                  <thead><tr><th />{parts.map((k) => <th key={k} className="r pl-3">{label(MEASUREMENTS, k, "ko")}</th>)}</tr></thead>
                  <tbody>{sizes.map((s) => <tr key={s.id}><td className="strong">{s.label}</td>{parts.map((k) => <td key={k} className="r pl-3">{s.measurements?.[k] ?? "-"}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <div className="section-h"><h2>{tk("offer.detail.spec")}</h2></div>
            <dl className="divide-y divide-line text-body">
              {([
                [tk("product.detail.fabric"), (p.fabric ?? []).map((f: { material_code: string; pct: number }) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ") || "-"],
                [tk("product.detail.care"), (p.care_codes ?? []).map((c: string) => label(CARE, c, "ko")).join(" · ") || "-"],
                [tk("product.detail.origin"), label(ORIGINS, p.origin ?? "", "ko") || "-"],
                [tk("product.detail.supplyType"), `${p.supply_type ? tk(`product.supply.${p.supply_type}`) : "-"}${p.lead_days ? ` · ${tk("detail.leadDays", { n: p.lead_days })}` : ""}${p.production_moq ? ` · ${tk("detail.productionMoq", { n: p.production_moq })}` : ""}`],
                [tk("product.detail.hold"), !hold || hold.none ? tk("product.detail.hold.none") : tk("product.detail.hold.deposit", { pct: Math.round((hold.deposit_pct ?? 0) * 100), days: hold.days ?? 0 })],
                ...(p.quality_note_ko ? [[tk("review.field.quality"), p.quality_note_ko]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)]">
                  <dt className="text-ink-2">{k}</dt><dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {(o.option_prices?.labels?.length > 0 || o.option_prices?.mods?.length > 0) && (
            <section>
              <div className="section-h"><h2>{tk("detail.options")}</h2></div>
              <ul className="num mt-2 divide-y divide-line text-body">
                {o.option_prices.labels.map((l, i) => <li key={`l${i}`} className="flex flex-wrap justify-between gap-x-3 py-2"><span>{tk(`product.option.labelType.${l.type}`)}</span><span className="text-ink-2">₩{krw(l.unit_price_krw)} · {tk("detail.moq", { n: l.moq })} · {tk("detail.leadDays", { n: l.lead_days })}</span></li>)}
                {o.option_prices.mods.map((m, i) => <li key={`m${i}`} className="flex flex-wrap justify-between gap-x-3 py-2"><span>{tk(`product.option.mod.${m.item}`)}</span><span className="text-ink-2">₩{krw(m.price_krw)} · {tk("detail.moq", { n: m.moq })} · {tk("detail.leadDays", { n: m.lead_days })}</span></li>)}
              </ul>
            </section>
          )}
          <p className="text-caption leading-relaxed text-muted">{tk("detail.tolerance")}</p>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper px-5 py-3 lg:hidden">
        <ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} />
      </div>
    </div>
  );
}
