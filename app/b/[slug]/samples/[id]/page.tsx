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
import { HandoffCard } from "@/components/domain/handoff-card";
import { handoffFor } from "@/lib/handoff";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { transitionEvents } from "@/lib/timeline";
import { brandMemberIds } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { authorLabel } from "@/lib/authors";
import { AuthorLine } from "@/components/domain/author-line";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { Photo } from "@/components/domain/photo";
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
  const [memberIds, dir] = await Promise.all([brandMemberIds(brand.id), memberDirectory(r.requested_by ? [r.requested_by] : [])]);
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const next = allowedNext("sample_request", r.status, actor);
  const [comments, events] = await Promise.all([brandThread(brand.id, user.id, "sample_request", id), transitionEvents("sample_request", [id])]);
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
    <div className="space-y-6">
      <Link href={`/b/${slug}/samples`} className="btn btn-ghost btn-sm -ml-2">{tk("common.back")}</Link>
      <header className="border-b border-ink pb-4">
        <div className="eyebrow">{tk("eyebrow.samples")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-title font-bold tracking-tight">{tk("sample.detail.title", { date: fmtDate(r.created_at) })}</h1>
          <StatusPill entity="sample_request" status={r.status} />
        </div>
        <div className="num mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-2">
          <AuthorLine a={authorLabel(r.requested_by, memberIds, r.requested_by ? dir.get(r.requested_by) : undefined)} />
          <span>{tk("sample.detail.qtySummary", { n: items.reduce((s, i) => s + i.qty, 0), k: items.length })}</span>
          {r.kr_tracking && <span>{tk("sample.detail.tracking", { t: r.kr_tracking })}</span>}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {(() => {
            const h = handoffFor("sample_request", r.status);
            return h && <HandoffCard owner={h.owner} due={h.owner === "BRAND" ? (r.status === "delivered" ? r.feedback_due : r.status === "feedback_done" ? r.return_due : r.due_at) : null} title={tk(h.title)} decide={tk(h.decide)} />;
          })()}
          <SampleHeaderActions brandId={brand.id} sampleId={r.id} canCancel={next.includes("cancelled") && (!r.payment_confirmed_at || user.role === "ADMIN")} canReceive={r.status === "sent_to_brand"} />

          {r.status === "awaiting_payment" && (
            <PaymentNoticeCard amount={r.logistics_fee_krw} bank={bank} due={r.due_at} reportedAt={r.payment_reported_at} confirmedAt={r.payment_confirmed_at}>
              <ReportPayment brandId={brand.id} sampleId={r.id} />
            </PaymentNoticeCard>
          )}
          {(r.feedback_due && r.status === "delivered") || r.return_due ? (
            <div className="flex flex-wrap gap-2">
              {r.feedback_due && r.status === "delivered" && <span className="num rounded-full bg-signature-soft px-3 py-1 text-meta font-medium text-signature">{tk("sample.detail.feedbackDue", { date: fmtDate(r.feedback_due) })}</span>}
              {r.return_due && <span className="num rounded-full bg-warn-soft px-3 py-1 text-meta font-medium text-warn">{tk("sample.detail.returnDue", { date: fmtDate(r.return_due) })}</span>}
            </div>
          ) : null}

          <section>
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <h2 className="eyebrow">{tk("sample.detail.items")}</h2>
              <span className="num text-caption text-ink-2">{tk("sample.detail.qtySummary", { n: items.reduce((s, i) => s + i.qty, 0), k: items.length })}</span>
            </div>
            <ol className="mt-4 space-y-3">
              {items.map((i) => {
                const l = label(i.variant_id);
                const canFeedback = (r.status === "delivered" || r.status === "feedback_done") && i.status !== "unavailable";
                const canReturn = canFeedback && i.return_status === "due" && !i.return_requested_at && i.charge_status === "none";
                return (
                  <li key={i.id} className="card grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="flex min-w-0 gap-4">
                      <div className="w-20 shrink-0">
                        <Photo src={i.inspection_photo_path ? photos[i.inspection_photo_path] : null} />
                      </div>
                      <div className="min-w-0 text-body">
                        <div className="num text-caption text-muted">{l.code}</div>
                        <div className="font-semibold">{l.name}</div>
                        <div className="num text-ink-2">{l.variant} · {tk("sample.list.qty", { n: i.qty })}</div>
                        {i.status !== "pending" && (
                          <div className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-caption font-medium ${i.status === "ok" ? "bg-signature-soft text-signature" : "bg-warn-soft text-warn"}`}>
                            {tk(`sample.inspect.${i.status}`)}{i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}
                          </div>
                        )}
                        {i.return_status === "returned" && <div className="mt-1 text-meta text-signature">{tk("sample.return.done")}</div>}
                        {i.return_requested_at && i.return_status !== "returned" && <div className="num mt-1 text-meta text-ink-2">{tk("sample.return.requested", { t: i.return_tracking ?? "" })}</div>}
                        {i.return_status === "kept" && i.charge_status === "none" && <div className="mt-1 text-meta text-ink-2">{tk("sample.keep.pending")}</div>}
                        {i.charge_status === "charged" && <div className="num mt-1 text-meta text-warn">{tk("sample.charged", { n: krw(i.charged_krw) })}</div>}
                      </div>
                    </div>
                    <div className="space-y-3 sm:border-l sm:border-line sm:pl-4">
                      {canFeedback && <ItemFeedback brandId={brand.id} itemId={i.id} current={i.feedback} />}
                      {canReturn && <ItemReturn brandId={brand.id} itemId={i.id} productFee={krw(i.qty * (i.product_price_krw ?? 0))} />}
                      {i.feedback === "interested" && data.offers.find((x) => x.id === i.offer_id)?.status === "expired" && (
                        <p className="text-meta text-warn">{tk("sample.offerExpired")}</p>
                      )}
                      {i.feedback === "interested" && data.offers.find((x) => x.id === i.offer_id)?.status === "interested" && (
                        <Link href={`/b/${slug}/orders/new?offers=${i.offer_id}`} className="btn btn-accent btn-sm w-full">{tk("sample.toOrder")}</Link>
                      )}
                      {!canFeedback && !["delivered", "feedback_done", "closed", "cancelled"].includes(r.status) && <p className="text-meta text-ink-2">{tk("sample.detail.feedbackLater")}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="card card-pad">
              <h2 className="eyebrow">{tk("request.detail.timeline")}</h2>
              {/* 전이 기록(audit_logs)이 있으면 그걸로, 없으면(이전 데이터) 단계 시각으로 */}
              <div className="mt-4"><Timeline rows={events.some((e) => e.kind === "transition")
                ? events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: tk(`status.sample_request.${e.to}`) }))
                : steps.map(([k, at]) => ({ at, label: tk(`sample.step.${k}`) }))} /></div>
            </section>
            <div className="card card-pad">
              <CommentThread targetType="sample_request" targetId={id} viewer="brand" tabs={["brand"]} rows={comments} />
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card card-pad">
            <h2 className="eyebrow">{tk("sample.detail.billing")}</h2>
            <div className="num mt-2 text-title font-semibold leading-none tracking-tight">₩{krw(r.logistics_fee_krw + charged)}</div>
            <dl className="num mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-3 text-body">
              <dt className="text-ink-2">{tk("sample.new.logistics")}</dt><dd>₩{krw(r.logistics_fee_krw)}</dd>
              <dt className="text-ink-2">{tk("sample.detail.chargedProducts")}</dt><dd>₩{krw(charged)}</dd>
              <dt className="border-t border-ink pt-1.5 font-semibold">{tk("sample.detail.billingTotal")}</dt><dd className="border-t border-ink pt-1.5 font-semibold">₩{krw(r.logistics_fee_krw + charged)}</dd>
            </dl>
            <p className="mt-3 text-caption text-muted">{tk("sample.detail.billingHelp")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
