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
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ReactionButtons } from "../reaction-buttons";

/**
 * B-05 상품 상세 (모바일 우선). 다른 브랜드 제안·없는 id·재확인 중(뷰가 가림) 모두 404.
 * 노출: 갤러리(실물컷 먼저) · 컬러칩 · 사이즈표(출처) · 혼용률·세탁·원산지 · 수량별 단가 + 수수료 내역 · 공급 형태 · 홀딩 · 샘플비(한 금액) · 옵션(KRW) · 허용 오차·물류 별도.
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

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <Link href={`/b/${slug}/offers`} className="text-meta text-muted">{tk("common.back")}</Link>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {ordered.map((i, k) => (
            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
            <img key={i.id} src={urls[i.storage_path]} alt="" className={`aspect-[3/4] w-full bg-sand object-cover ${k === 0 ? "col-span-2" : ""}`} />
          ))}
        </div>
      </div>
      <div className="space-y-6 pb-24 lg:pb-0">
        <div>
          <div className="flex items-center gap-2 text-caption">
            <span className="num tracking-wide text-muted">{p.code}</span>
            {p.verified_in_person && <span className="bg-signature-soft px-1.5 py-0.5 font-semibold text-signature">{tk("linesheet.verified")}</span>}
            {o.type === "recommend" && <span className="bg-sand px-1.5 py-0.5 text-ink-2">{tk("linesheet.recommend")}</span>}
            {dday !== null && <span className="num bg-ink px-1.5 py-0.5 text-paper">{tk("linesheet.dday", { n: dday })}</span>}
          </div>
          <h1 className="mt-1 text-h1 font-bold leading-tight tracking-tight">{p.name_ko}</h1>
          {p.desc_ko && <p className="mt-2 whitespace-pre-wrap text-lead text-ink-2">{p.desc_ko}</p>}
          {o.admin_comment && <p className="mt-3 border-l-2 border-signature pl-3 text-body">{o.admin_comment}</p>}
        </div>

        <PriceBreakdown tiers={o.price_tiers} feeRate={o.fee_rate} />
        <div className="hidden lg:block"><ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} /></div>

        <section className="space-y-1 text-body">
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-line" style={{ background: c.hex ?? "transparent" }} />{c.name_ko}</span>
            ))}
          </div>
        </section>

        {sizes.length > 0 && (
          <section>
            <h2 className="text-meta font-semibold text-ink-2">{tk("detail.sizeChart")} <span className="font-normal text-muted">(cm · {sizes.some((s) => s.source === "measured") ? tk("detail.measured") : tk("detail.vendorChart")})</span></h2>
            <div className="mt-1 overflow-x-auto">
              <table className="num w-full text-meta">
                <thead className="text-left text-muted"><tr><th className="py-1 pr-2" />{parts.map((k) => <th key={k} className="pr-2 font-normal">{label(MEASUREMENTS, k, "ko")}</th>)}</tr></thead>
                <tbody>{sizes.map((s) => <tr key={s.id} className="border-t border-line"><td className="py-1 pr-2 font-medium">{s.label}</td>{parts.map((k) => <td key={k} className="pr-2">{s.measurements?.[k] ?? "-"}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        <dl className="grid grid-cols-[96px_1fr] gap-y-1.5 text-body">
          <dt className="text-muted">{tk("product.detail.fabric")}</dt><dd>{(p.fabric ?? []).map((f: { material_code: string; pct: number }) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ")}</dd>
          <dt className="text-muted">{tk("product.detail.care")}</dt><dd>{(p.care_codes ?? []).map((c: string) => label(CARE, c, "ko")).join(" · ")}</dd>
          <dt className="text-muted">{tk("product.detail.origin")}</dt><dd>{label(ORIGINS, p.origin ?? "", "ko")}</dd>
          <dt className="text-muted">{tk("product.detail.supplyType")}</dt><dd>{p.supply_type ? tk(`product.supply.${p.supply_type}`) : "-"}{p.lead_days ? ` · ${tk("detail.leadDays", { n: p.lead_days })}` : ""}{p.production_moq ? ` · ${tk("detail.productionMoq", { n: p.production_moq })}` : ""}</dd>
          <dt className="text-muted">{tk("product.detail.minQty")}</dt><dd className="num">{p.min_qty}</dd>
          <dt className="text-muted">{tk("product.detail.hold")}</dt><dd>{!hold || hold.none ? tk("product.detail.hold.none") : tk("product.detail.hold.deposit", { pct: Math.round((hold.deposit_pct ?? 0) * 100), days: hold.days ?? 0 })}</dd>
          {o.sample_logistics_krw != null && (<>
            <dt className="text-muted">{tk("detail.sample")}</dt>
            <dd><span className="num font-semibold">₩{krw(sampleTotal)}</span> <span className="text-caption text-muted">{tk("detail.sampleNote", { product: krw(o.sample_fee_product_krw ?? 0) })}</span></dd>
          </>)}
          <dt className="text-muted">{tk("detail.valid")}</dt><dd className="num">{fmtDate(o.valid_until)}</dd>
          {p.quality_note_ko && (<><dt className="text-muted">{tk("review.field.quality")}</dt><dd>{p.quality_note_ko}</dd></>)}
        </dl>

        {(o.option_prices?.labels?.length > 0 || o.option_prices?.mods?.length > 0) && (
          <section className="text-body">
            <h2 className="text-meta font-semibold text-ink-2">{tk("detail.options")}</h2>
            <ul className="num mt-1 space-y-0.5">
              {o.option_prices.labels.map((l, i) => <li key={`l${i}`}>{tk(`product.option.labelType.${l.type}`)} · ₩{krw(l.unit_price_krw)} · {tk("detail.moq", { n: l.moq })} · {tk("detail.leadDays", { n: l.lead_days })}</li>)}
              {o.option_prices.mods.map((m, i) => <li key={`m${i}`}>{tk(`product.option.mod.${m.item}`)} · ₩{krw(m.price_krw)} · {tk("detail.moq", { n: m.moq })} · {tk("detail.leadDays", { n: m.lead_days })}</li>)}
            </ul>
          </section>
        )}
        <p className="text-caption leading-relaxed text-muted">{tk("detail.tolerance")}</p>
        {o.status === "interested" || o.status === "hold" ? (
          <Link href={`/b/${slug}/samples/new?offers=${o.id}`} className="block w-full bg-ink py-3 text-center text-lead font-medium text-paper">{tk("detail.addToSample")}</Link>
        ) : (
          <p className="text-center text-meta text-muted">{tk("detail.addToSampleHint")}</p>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowedNext("offer", o.status, actor)} />
      </div>
    </div>
  );
}
