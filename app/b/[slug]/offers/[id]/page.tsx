import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandOffer, getOfferProgress, getOfferRequestContext } from "@/lib/db/brand/offers";
import { orderableOfferIds } from "@/lib/db/brand/orders";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { CARE, MATERIALS, MEASUREMENTS, label } from "@/lib/codes";
import { supplyPriceKrw } from "@/lib/pricing";
import { Figure } from "@/components/domain/figure";
import { fmtDay, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ReactionButtons } from "../reaction-buttons";
import { BackLink } from "../../_ui/list";
import { Gallery } from "./gallery";

/**
 * B-05 제안 상세 (디자인 v2.2 "제안 상세"). 다른 브랜드 제안·없는 id·재확인 중(뷰가 가림) 모두 404.
 * 12칸: 6칸 큰 사진 + 썸네일 5 / 6칸 — 메타 13("새 제안 · 요청 n번 항목 · 날짜까지 유효") · 이름 28 · 한 문장(실물 확인) ·
 * 장당 공급가 40(수수료 포함, "n장부터"; 다음 구간 · 샘플비) · 사실 다섯 줄(`.kvl`) · "관심 · 샘플에 담기" / "보류" / "관심 없어요".
 * 트랙·스펙 표·상품 코드 없음(d-11). 반응은 기존 서버 액션(reactToOffer) 그대로 — 전이는 서버가 다시 검증한다.
 */
export default async function OfferDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand, member } = await requireBrandMember(slug);
  const data = await getBrandOffer(brand.id, id);
  if (!data) notFound();
  const { offer: o, product: p, images, colors, sizes } = data;
  const [ctx, progress] = await Promise.all([getOfferRequestContext(brand.id, o.request_item_id), getOfferProgress(brand.id, o.id)]);
  // 대표 사진 = CN 편집 화면 1번(sort_order 가장 작은 것), 썸네일도 같은 순서 — v2.3 T4(쿼리가 sort_order·id 순으로 준다)
  const ordered = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const urls = await signedReadUrls("productImages", ordered.map((i) => i.storage_path));
  const photos = ordered.map((i) => urls[i.storage_path]).filter(Boolean) as string[];
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const allowed = allowedNext("offer", o.status, actor);
  // 보류 중이면 "샘플 받아보기"(관심 + 요청서)가 이미 보이므로 "샘플 요청하기"를 따로 두지 않는다 (11-12 점검)
  const canSample = o.status === "interested" || (o.status === "hold" && !allowed.includes("interested"));
  // 행동 블록(7차 O1): 샘플·발주로 넘어갔으면 사실 줄 + 보기 링크, 샘플 요청서에 담김(관심 · 샘플 전)이면 "샘플 요청하기"만, 그 전엔 반응 버튼
  const inCart = !progress && o.status === "interested";
  const progressFact = !progress ? null
    : progress.kind === "order" ? tk(progress.done ? "offer.detail.fact.orderDone" : "offer.detail.fact.order", { n: krw(progress.qty) })
    : progress.received && progress.receivedAt ? tk("offer.detail.fact.sampleReceived", { date: fmtDay(progress.receivedAt) })
    : [tk(progress.stateKey), progress.due ? tk("state.until", { date: fmtDay(progress.due) }) : null].filter(Boolean).join(" · ");
  const progressLink = !progress ? null
    : progress.kind === "order" ? { href: `/b/${slug}/orders/${progress.id}`, label: tk("offer.detail.viewOrder") }
    : { href: `/b/${slug}/samples/${progress.id}`, label: tk("offer.detail.viewSample") };

  // 메타: 첫 조각은 반응 전이면 "새 제안"(추천이면 "위아더 추천"), 반응 뒤엔 지금 상태 문장
  const stateKey = o.status === "new" ? null : o.status === "reconsent_pending" ? "state.offer.reconsent" : `state.offer.${o.status}`;
  // 샘플·발주로 넘어간 제안은 "관심 표시함 · 샘플 요청서에 담김" 대신 지금 단계(샘플 진행 / 발주 진행 / 끝)
  // 샘플 단계에서 담기 조건(샘플 관심)을 채웠으면 발주서 진입 버튼(B-08) — 발주서 화면과 같은 판정
  const canOrder = progress?.kind === "sample" && (await orderableOfferIds(brand.id)).includes(o.id);
  const progressPhase = progress ? (progress.kind === "order" ? (progress.done ? "done" : "order") : "sample") : null;
  const meta = [
    progressPhase ? tk(`request.detail.phase.${progressPhase}`) : stateKey ? tk(stateKey) : tk(o.type === "recommend" ? "offer.detail.kind.recommend" : "offer.detail.kind.new"),
    ctx ? tk("offer.detail.item", { title: ctx.title ?? tk("request.untitled"), n: ctx.seq }) : null,
    o.status !== "expired" && o.status !== "declined" ? tk("offer.detail.validUntil", { date: fmtDay(o.valid_until) }) : null,
  ].filter(Boolean).join(" · ");

  const tiers = [...o.price_tiers].sort((a, b) => a.min_qty - b.min_qty);
  const base = tiers[0];
  const supply = (t: { product_price_krw: number }) => supplyPriceKrw(t.product_price_krw, o.fee_rate);
  const priceRows: [React.ReactNode, React.ReactNode][] = [
    ...tiers.slice(1).map((t) => [tk("offer.detail.from", { n: t.min_qty }), `₩${krw(supply(t))}`] as [string, string]),
    ...(o.sample_logistics_krw != null ? [[tk("offer.detail.sampleFee"), `₩${krw(o.sample_logistics_krw)}`] as [string, string]] : []),
  ];

  // 사실 다섯 줄: 색상 · 사이즈 · 소재 · 세탁 · 공급
  const parts = [...new Set(sizes.flatMap((s) => Object.keys(s.measurements ?? {})))];
  const sizeText = sizes.length === 1
    ? [sizes[0].label, ...parts.map((k) => `${label(MEASUREMENTS, k, "ko")} ${sizes[0].measurements?.[k] ?? "-"}`)].join(" · ")
    : sizes.map((s) => s.label).join(" · ");
  const hold = p.hold as { none?: boolean; deposit_pct?: number; days?: number } | null;
  const supplyText = [
    p.supply_type ? tk(`product.supply.${p.supply_type}`) : null,
    p.lead_days ? tk("detail.leadDays", { n: p.lead_days }) : null,
    p.min_qty ? tk("offer.detail.minQty", { n: p.min_qty }) : null,
    hold && !hold.none ? tk("product.detail.hold.deposit", { pct: Math.round((hold.deposit_pct ?? 0) * 100), days: hold.days ?? 0 }) : null,
    o.option_prices?.labels?.length ? tk("offer.detail.labelOk") : null,
  ].filter(Boolean).join(" · ");
  const facts: [string, React.ReactNode][] = [
    [tk("offer.detail.kvl.color"), colors.length ? (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        {/* hex가 있는 색만 점 — 없으면 이름만(빈 원 금지, v2.3 T6) */}
        {colors.some((c) => c.hex) && <span className="swatch" aria-hidden>{colors.filter((c) => c.hex).map((c) => <i key={c.id} style={{ background: c.hex! }} />)}</span>}
        {colors.map((c) => c.name_ko).join(" · ")}
      </span>
    ) : "-"],
    [tk("offer.detail.kvl.size"), sizeText || "-"],
    [tk("offer.detail.kvl.fabric"), (p.fabric ?? []).map((f: { material_code: string; pct: number }) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(" · ") || "-"],
    [tk("offer.detail.kvl.care"), (p.care_codes ?? []).map((c: string) => label(CARE, c, "ko")).join(" · ") || "-"],
    [tk("offer.detail.kvl.supply"), supplyText || "-"],
  ];

  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c6 min-w-0"><Gallery urls={photos} alt={p.name_ko ?? ""} /></div>
      <div className="c6 min-w-0">
        <p className="meta">{meta}</p>
        <h1 className="h1 mt-3">{p.name_ko}</h1>
        {p.verified_in_person && (
          <p className="lead mt-3">{p.verified_at ? tk("offer.detail.verifiedOn", { date: fmtDay(p.verified_at) }) : tk("offer.detail.verifiedPlain")}</p>
        )}
        {o.admin_comment && <p className="mt-2 text-meta text-ink-2">{o.admin_comment}</p>}
        {base && (
          <div className="mt-8">
            <Figure first label={tk("offer.detail.unitPrice")} currency="₩"
              value={<>{krw(supply(base))}<span className="label ml-3 align-middle tracking-normal">{tk("offer.detail.from", { n: base.min_qty })}</span></>}
              rows={priceRows} />
          </div>
        )}
        <dl className="kvl mt-8">
          {facts.map(([k, v]) => (
            <div key={k} className="contents"><dt>{k}</dt><dd className="min-w-0">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-8">
          {progress && progressLink ? (
            <div className="flex flex-wrap items-center gap-6">
              <p className="text-lead font-medium">{progressFact}</p>
              <Link href={progressLink.href} className="link">{progressLink.label}</Link>
              {canOrder && <Link href={`/b/${slug}/orders/new?offers=${o.id}`} className="btn lg max-sm:w-full">{tk("sample.toOrder")}</Link>}
            </div>
          ) : inCart ? (
            <Link href={`/b/${slug}/samples/new?offers=${o.id}`} className="btn lg max-sm:w-full">{tk("offer.detail.requestSample")}</Link>
          ) : (
            <ReactionButtons brandId={brand.id} offerId={o.id} status={o.status} allowed={allowed} detail
              after={canSample ? <Link href={`/b/${slug}/samples/new?offers=${o.id}`} className="btn lg max-sm:w-full">{tk("offer.detail.requestSample")}</Link> : null} />
          )}
        </div>
        <p className="mt-8 text-caption text-muted">{tk("price.logisticsSeparate")}</p>
      </div>
    </div>
  );
}
