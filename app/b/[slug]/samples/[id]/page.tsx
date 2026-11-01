import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandSample } from "@/lib/db/brand/samples";
import { getBankAccount } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { StatusPill } from "@/components/domain/status-pill";
import { Timeline } from "@/components/domain/timeline";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ItemFeedback, ItemReturn, ReportPayment, SampleHeaderActions } from "../sample-controls";

/**
 * B-07 샘플 현황 상세: 입금 안내 → 진행 타임라인 → variant별 검품 결과 → 피드백 → 회수/보유 → 청구 예정.
 * "발주서에 담기"는 제안 관심 + 샘플 피드백 관심일 때만 (절대 규칙 7 — 서버가 다시 판정).
 */
export default async function SampleDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand, member } = await requireBrandMember(slug);
  const data = await getBrandSample(brand.id, id);
  if (!data) notFound();
  const { request: r, items } = data;
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const next = allowedNext("sample_request", r.status, actor);
  const [bank, photos] = await Promise.all([
    r.status === "awaiting_payment" ? getBankAccount() : Promise.resolve(null),
    signedReadUrls("samplePhotos", items.flatMap((i) => (i.inspection_photo_path ? [i.inspection_photo_path] : []))),
  ]);
  const label = (variantId: string) => {
    const v = data.variants.find((x) => x.id === variantId);
    const p = v && data.products.find((x) => x.id === v.product_id);
    const c = v && data.colors.find((x) => x.id === v.color_id);
    const s = v && data.sizes.find((x) => x.id === v.size_id);
    return { code: p?.code, name: p?.name_ko, variant: [c?.name_ko, s?.label].filter(Boolean).join(" / ") };
  };
  const charged = items.reduce((s, i) => s + (i.charge_status === "charged" ? i.charged_krw : 0), 0);
  const steps = [
    ["created", r.created_at], ["payment", r.payment_confirmed_at], ["cn_shipped", r.cn_shipped_at], ["kr_arrived", r.kr_arrived_at],
    ["inspected", r.inspected_at], ["sent", r.sent_at], ["delivered", r.delivered_at],
  ].filter(([, at]) => at) as [string, string][];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Link href={`/b/${slug}/samples`} className="text-[12px] text-muted">{tk("common.back")}</Link>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink pb-3">
          <h1 className="text-[24px] font-bold tracking-tight">{tk("sample.detail.title", { date: fmtDate(r.created_at) })}</h1>
          <StatusPill entity="sample_request" status={r.status} />
        </div>
        <SampleHeaderActions brandId={brand.id} sampleId={r.id} canCancel={next.includes("cancelled")} canReceive={r.status === "sent_to_brand"} />

        {r.status === "awaiting_payment" && (
          <PaymentNoticeCard amount={r.logistics_fee_krw} bank={bank} due={r.due_at} reportedAt={r.payment_reported_at} confirmedAt={r.payment_confirmed_at}>
            <ReportPayment brandId={brand.id} sampleId={r.id} />
          </PaymentNoticeCard>
        )}
        {r.kr_tracking && <p className="num text-[13px] text-ink-2">{tk("sample.detail.tracking", { t: r.kr_tracking })}</p>}
        {r.feedback_due && r.status === "delivered" && <p className="num text-[13px] text-signature">{tk("sample.detail.feedbackDue", { date: fmtDate(r.feedback_due) })}</p>}
        {r.return_due && <p className="num text-[13px] text-warn">{tk("sample.detail.returnDue", { date: fmtDate(r.return_due) })}</p>}

        <ol className="divide-y divide-line border-t border-line">
          {items.map((i) => {
            const l = label(i.variant_id);
            const canFeedback = (r.status === "delivered" || r.status === "feedback_done") && i.status !== "unavailable";
            const canReturn = canFeedback && i.return_status === "due" && !i.return_requested_at && i.charge_status === "none";
            return (
              <li key={i.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_260px]">
                <div className="flex gap-3">
                  {i.inspection_photo_path && photos[i.inspection_photo_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                    <img src={photos[i.inspection_photo_path]} alt="" className="aspect-[3/4] w-16 bg-sand object-cover" />
                  ) : <span className="aspect-[3/4] w-16 bg-sand" />}
                  <div className="text-[13px]">
                    <div className="num text-[11px] text-muted">{l.code}</div>
                    <div className="font-medium">{l.name}</div>
                    <div className="num text-ink-2">{l.variant} · {tk("sample.list.qty", { n: i.qty })}</div>
                    {i.status !== "pending" && (
                      <div className={`mt-1 text-[12px] ${i.status === "ok" ? "text-signature" : "text-warn"}`}>
                        {tk(`sample.inspect.${i.status}`)}{i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}
                      </div>
                    )}
                    {i.return_status === "returned" && <div className="text-[12px] text-signature">{tk("sample.return.done")}</div>}
                    {i.return_requested_at && i.return_status !== "returned" && <div className="num text-[12px] text-ink-2">{tk("sample.return.requested", { t: i.return_tracking ?? "" })}</div>}
                    {i.return_status === "kept" && i.charge_status === "none" && <div className="text-[12px] text-ink-2">{tk("sample.keep.pending")}</div>}
                    {i.charge_status === "charged" && <div className="num text-[12px] text-warn">{tk("sample.charged", { n: krw(i.charged_krw) })}</div>}
                  </div>
                </div>
                <div className="space-y-3">
                  {canFeedback && <ItemFeedback brandId={brand.id} itemId={i.id} current={i.feedback} />}
                  {canReturn && <ItemReturn brandId={brand.id} itemId={i.id} productFee={krw(i.qty * (i.product_price_krw ?? 0))} />}
                  {i.feedback === "interested" && data.offers.find((x) => x.id === i.offer_id)?.status === "interested" && (
                    <Link href={`/b/${slug}/orders/new?offers=${i.offer_id}`} className="block w-full border border-ink py-1.5 text-center text-[12px]">{tk("sample.toOrder")}</Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <aside className="space-y-6">
        <section className="bg-surface p-4">
          <h2 className="text-[12px] font-semibold text-ink-2">{tk("sample.detail.billing")}</h2>
          <dl className="num mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
            <dt className="text-ink-2">{tk("sample.new.logistics")}</dt><dd>₩{krw(r.logistics_fee_krw)}</dd>
            <dt className="text-ink-2">{tk("sample.detail.chargedProducts")}</dt><dd>₩{krw(charged)}</dd>
            <dt className="font-semibold">{tk("sample.detail.billingTotal")}</dt><dd className="font-semibold">₩{krw(r.logistics_fee_krw + charged)}</dd>
          </dl>
          <p className="mt-2 text-[11px] text-muted">{tk("sample.detail.billingHelp")}</p>
        </section>
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("request.detail.timeline")}</h2>
          <div className="mt-3"><Timeline rows={steps.map(([k, at]) => ({ at, label: tk(`sample.step.${k}`) }))} /></div>
        </section>
      </aside>
    </div>
  );
}
