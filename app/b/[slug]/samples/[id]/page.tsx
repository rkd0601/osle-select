import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandSample } from "@/lib/db/brand/samples";
import { getBankAccount } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { StatusDot } from "@/components/domain/status-pill";
import { Timeline } from "@/components/domain/timeline";
import { HandoffCard } from "@/components/domain/handoff-card";
import { InvoiceSheet } from "@/components/domain/invoice-sheet";
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
import { BackLink, bundleTitle, shortId } from "../../_ui/list";
import { ItemFeedback, ItemReturn, ReportPayment, SampleHeaderActions } from "../sample-controls";

/**
 * B-07 샘플 현황 상세 (디자인 v2 §5, 발주 상세와 같은 뼈대). 제목 `{첫 상품명} 외 n · {수량}장`, 눈썹 `샘플 · 날짜 · #id`.
 * 핸드오프 → 입금 안내 → 기한 3칸 → 담은 상품(검품 결과 · 피드백 · 회수/보유) → 진행 기록 | 코멘트. 오른쪽 청구표.
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
    return { productId: p?.id, code: p?.code, name: p?.name_ko, variant: [c?.name_ko, s?.label].filter(Boolean).join(" / ") };
  };
  const charged = items.reduce((s, i) => s + (i.charge_status === "charged" ? i.charged_krw : 0), 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const products = items.map((i) => label(i.variant_id)).filter((p, k, xs) => p.productId && xs.findIndex((x) => x.productId === p.productId) === k);
  const title = bundleTitle({ firstName: products[0]?.name ?? null, more: Math.max(0, products.length - 1) }, totalQty, tk("sample.detail.title", { date: fmtDate(r.created_at) }));
  const steps = [
    ["created", r.created_at], ["payment", r.payment_confirmed_at], ["cn_shipped", r.cn_shipped_at], ["kr_arrived", r.kr_arrived_at],
    ["inspected", r.inspected_at], ["sent", r.sent_at], ["delivered", r.delivered_at],
  ].filter(([, at]) => at) as [string, string][];
  const h = handoffFor("sample_request", r.status);
  const handoffDue = h?.owner === "BRAND" ? (r.status === "delivered" ? r.feedback_due : r.status === "feedback_done" ? r.return_due : r.due_at) : null;

  return (
    <div>
      <BackLink href={`/b/${slug}/samples`} label={tk("nav.samples")} />
      <div className="two mt-5">
        <div className="stack min-w-0">
          <div>
            <div className="phead" style={{ borderBottom: 0, paddingBottom: 0 }}>
              <div className="min-w-0">
                <div className="eyebrow">{tk("sample.detail.eyebrow", { date: fmtDate(r.created_at), id: shortId(r.id) })}</div>
                <h1 className="h1 mt-3">{title}</h1>
                <p className="sub flex flex-wrap gap-x-3 gap-y-1">
                  <AuthorLine a={authorLabel(r.requested_by, memberIds, r.requested_by ? dir.get(r.requested_by) : undefined)} />
                  {r.kr_tracking && <span className="num text-meta">{tk("sample.detail.tracking", { t: r.kr_tracking })}</span>}
                </p>
              </div>
              <div className="shrink-0 pb-1.5"><StatusDot entity="sample_request" status={r.status} /></div>
            </div>
            {h && <div className="mt-7"><HandoffCard owner={h.owner} due={handoffDue} title={tk(h.title)} decide={tk(h.decide)} /></div>}
            <div className="mt-4 empty:hidden">
              <SampleHeaderActions brandId={brand.id} sampleId={r.id} canCancel={next.includes("cancelled") && (!r.payment_confirmed_at || user.role === "ADMIN")} canReceive={r.status === "sent_to_brand"} />
            </div>
          </div>

          {r.status === "awaiting_payment" && (
            <PaymentNoticeCard amount={r.logistics_fee_krw} bank={bank} due={r.due_at} reportedAt={r.payment_reported_at} confirmedAt={r.payment_confirmed_at}>
              <ReportPayment brandId={brand.id} sampleId={r.id} />
            </PaymentNoticeCard>
          )}

          <dl className="kv">
            <div><dt className="label">{tk("sample.detail.deliveredLabel")}</dt><dd className="v">{fmtDate(r.delivered_at)}</dd></div>
            <div><dt className="label">{tk("sample.detail.feedbackDueLabel")}</dt><dd className="v">{fmtDate(r.feedback_due)}</dd></div>
            <div><dt className="label">{tk("sample.detail.returnDueLabel")}</dt><dd className={`v ${r.return_due && r.status === "feedback_done" ? "text-warn" : ""}`}>{fmtDate(r.return_due)}</dd></div>
          </dl>

          <section>
            <div className="section-h"><h2>{tk("sample.detail.items")}<span className="count">{tk("sample.detail.qtySummary", { n: totalQty, k: items.length })}</span></h2></div>
            <ol>
              {items.map((i) => {
                const l = label(i.variant_id);
                const canFeedback = (r.status === "delivered" || r.status === "feedback_done") && i.status !== "unavailable";
                const canReturn = canFeedback && i.return_status === "due" && !i.return_requested_at && i.charge_status === "none";
                const offerStatus = data.offers.find((x) => x.id === i.offer_id)?.status;
                const showSide = canFeedback || canReturn || i.feedback === "interested" || !["delivered", "feedback_done", "closed", "cancelled"].includes(r.status);
                return (
                  <li key={i.id} className={`grid gap-x-8 gap-y-4 border-b border-line py-6 ${showSide ? "sm:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
                    <div className="flex min-w-0 gap-5">
                      <div className="w-24 shrink-0">
                        <Photo src={i.inspection_photo_path ? photos[i.inspection_photo_path] : null} alt={l.name ?? ""} />
                      </div>
                      <div className="min-w-0 text-body">
                        <div className="num text-caption tracking-[.04em] text-muted">{l.code}</div>
                        <div className="text-lead font-medium">{l.name}</div>
                        <div className="num mt-0.5 text-meta text-ink-2">{l.variant} · {tk("sample.list.qty", { n: i.qty })}</div>
                        <div className="mt-3 flex flex-col items-start gap-1.5">
                          {i.status !== "pending" && (
                            <span className={`st ${i.status === "ok" ? "done" : "warn"}`}>
                              {tk(`sample.inspect.${i.status}`)}{i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}
                            </span>
                          )}
                          {i.return_status === "returned" && <span className="st done">{tk("sample.return.done")}</span>}
                          {i.return_requested_at && i.return_status !== "returned" && <span className="st wait num">{tk("sample.return.requested", { t: i.return_tracking ?? "" })}</span>}
                          {i.return_status === "kept" && i.charge_status === "none" && <span className="st wait">{tk("sample.keep.pending")}</span>}
                          {i.charge_status === "charged" && <span className="st warn num">{tk("sample.charged", { n: krw(i.charged_krw) })}</span>}
                        </div>
                      </div>
                    </div>
                    {showSide && (
                      <div className="space-y-4">
                        {canFeedback && <ItemFeedback brandId={brand.id} itemId={i.id} current={i.feedback} />}
                        {canReturn && <ItemReturn brandId={brand.id} itemId={i.id} productFee={krw(i.qty * (i.product_price_krw ?? 0))} />}
                        {i.feedback === "interested" && offerStatus === "expired" && <p className="text-meta text-warn">{tk("sample.offerExpired")}</p>}
                        {i.feedback === "interested" && offerStatus === "interested" && (
                          <Link href={`/b/${slug}/orders/new?offers=${i.offer_id}`} className="btn sec sm w-full">{tk("sample.toOrder")}</Link>
                        )}
                        {!canFeedback && !["delivered", "feedback_done", "closed", "cancelled"].includes(r.status) && <p className="text-meta text-ink-2">{tk("sample.detail.feedbackLater")}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="two half">
            <section>
              <div className="section-h" style={{ borderBottom: 0, paddingBottom: 16 }}><h2>{tk("request.detail.timeline")}</h2></div>
              {/* 전이 기록(audit_logs)이 있으면 그걸로, 없으면(이전 데이터) 단계 시각으로 */}
              <Timeline rows={events.some((e) => e.kind === "transition")
                ? events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: tk(`status.sample_request.${e.to}`) }))
                : steps.map(([k, at]) => ({ at, label: tk(`sample.step.${k}`) }))} />
            </section>
            <CommentThread targetType="sample_request" targetId={id} viewer="brand" tabs={["brand"]} rows={comments} />
          </div>
        </div>

        <aside className="min-w-0">
          <InvoiceSheet
            label={tk("sample.detail.billing")}
            total={r.logistics_fee_krw + charged}
            // 항목이 샘플비 하나뿐이면 내역을 내지 않는다 — 합계와 같은 숫자를 세 번 보이지 않게
            rows={charged > 0 ? [
              { label: tk("sample.new.logistics"), value: r.logistics_fee_krw },
              { label: tk("sample.detail.chargedProducts"), value: charged },
            ] : []}
            sumLabel={charged > 0 ? tk("sample.detail.billingTotal") : tk("sample.new.logistics")}
            help={tk("sample.detail.billingHelp")}
          />
        </aside>
      </div>
    </div>
  );
}
