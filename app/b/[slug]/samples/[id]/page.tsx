import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandSample } from "@/lib/db/brand/samples";
import { getBankAccount } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { Timeline } from "@/components/domain/timeline";
import { NowBlock } from "@/components/domain/todo-row";
import { InvoiceSheet } from "@/components/domain/invoice-sheet";
import { handoffFor } from "@/lib/handoff";
import { oneLine, sampleStateKey } from "@/lib/brand-state";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { transitionEvents } from "@/lib/timeline";
import { brandMemberIds } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { authorLabel } from "@/lib/authors";
import { AuthorLine } from "@/components/domain/author-line";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { Photo } from "@/components/domain/photo";
import { fmtDay, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BackLink } from "../../_ui/list";
import { ItemFeedback, ItemReturn, ReportPayment, SampleHeaderActions } from "../sample-controls";

/**
 * B-07 샘플 상세 (디자인 v2.2 — 발주 상세와 같은 뼈대). 12칸: 왼쪽 8 — 메타 13("샘플 · 11월 4일") · 제목 `{상품명} {수량}장`
 * → 지금 상태 블록(`.nowblock`) → 입금 안내 → 기한 3칸 → 받은 옵션(사진 · 옵션 · 검품 결과 문장 · 피드백 · 회수/보유) → "지금까지" | "위아더에게".
 * 오른쪽 4 — 청구표. 상태 점·눈썹·#id·상품 코드 없음(d-11). "발주 담기"는 제안 관심 + 샘플 피드백 관심일 때만 (절대 규칙 7 — 서버가 다시 판정).
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
  const cover = (pid: string | undefined) => {
    const imgs = data.images.filter((i) => i.product_id === pid);
    return (imgs.find((i) => i.kind === "real") ?? imgs[0])?.storage_path ?? null;
  };
  const coverPaths = [...new Set(data.products.map((p) => cover(p.id)).filter(Boolean) as string[])];
  const [bank, photos, covers] = await Promise.all([
    r.status === "awaiting_payment" ? getBankAccount() : Promise.resolve(null),
    signedReadUrls("samplePhotos", items.flatMap((i) => (i.inspection_photo_path ? [i.inspection_photo_path] : []))),
    signedReadUrls("productImages", coverPaths),
  ]);
  const label = (variantId: string) => {
    const v = data.variants.find((x) => x.id === variantId);
    const p = v && data.products.find((x) => x.id === v.product_id);
    const c = v && data.colors.find((x) => x.id === v.color_id);
    const s = v && data.sizes.find((x) => x.id === v.size_id);
    return { productId: p?.id, name: p?.name_ko as string | null | undefined, variant: [c?.name_ko, s?.label].filter(Boolean).join(" / ") };
  };
  const charged = items.reduce((s, i) => s + (i.charge_status === "charged" ? i.charged_krw : 0), 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const products = items.map((i) => label(i.variant_id)).filter((p, k, xs) => p.productId && xs.findIndex((x) => x.productId === p.productId) === k);
  const multi = products.length > 1;
  const steps = [
    ["created", r.created_at], ["payment", r.payment_confirmed_at], ["cn_shipped", r.cn_shipped_at], ["kr_arrived", r.kr_arrived_at],
    ["inspected", r.inspected_at], ["sent", r.sent_at], ["delivered", r.delivered_at],
  ].filter(([, at]) => at) as [string, string][];

  // 지금 상태: 사람 말 한 문장 + 다음 행동 한 문장 + 기한
  const paidReported = r.status === "awaiting_payment" && !!r.payment_reported_at;
  const h = paidReported ? null : handoffFor("sample_request", r.status);
  const stateKey = sampleStateKey(r, items);
  const mine = h?.owner === "BRAND" && (r.status !== "feedback_done" || stateKey === "state.sample.return_due");
  const dueAt = r.status === "delivered" ? r.feedback_due : r.status === "feedback_done" ? r.return_due : r.due_at;
  const nowSub = ["closed", "cancelled"].includes(r.status) ? null : oneLine([
    h && (r.status !== "feedback_done" || mine) ? tk(h.decide) : null,
    dueAt && (mine || r.status !== "feedback_done") ? tk(mine ? "state.until" : "state.on", { date: fmtDay(dueAt) }) : null,
  ]);
  const firstCover = cover(products[0]?.productId);
  const canCancel = next.includes("cancelled") && (!r.payment_confirmed_at || user.role === "ADMIN");
  const canReceive = r.status === "sent_to_brand";
  const name = products[0]?.name ?? tk("sample.new.title");

  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8 min-w-0">
        <p className="meta flex flex-wrap gap-x-2">
          <span>{tk("sample.detail.meta", { date: fmtDay(r.created_at) })}</span>
          <AuthorLine a={authorLabel(r.requested_by, memberIds, r.requested_by ? dir.get(r.requested_by) : undefined)} />
        </p>
        <h1 className="h1 mt-2.5">
          {name}
          {multi && <span className="dim"> {tk("detail.more", { n: products.length - 1 })}</span>}
          {" "}<span className="num thin">{tk("detail.qty", { n: totalQty })}</span>
        </h1>
        <NowBlock photo={firstCover ? covers[firstCover] ?? null : null} title={tk(stateKey)} sub={nowSub}>
          {canCancel || canReceive ? <SampleHeaderActions brandId={brand.id} sampleId={r.id} canCancel={canCancel} canReceive={canReceive} /> : null}
        </NowBlock>

        {r.status === "awaiting_payment" && (
          <div className="mt-8">
            <PaymentNoticeCard amount={r.logistics_fee_krw} bank={bank} due={r.due_at} reportedAt={r.payment_reported_at} confirmedAt={r.payment_confirmed_at}>
              <ReportPayment brandId={brand.id} sampleId={r.id} />
            </PaymentNoticeCard>
          </div>
        )}

        <dl className="kv mt-6" style={{ borderTop: 0, paddingTop: 0 }}>
          <div><dt className="label">{tk("sample.detail.deliveredLabel")}</dt><dd className="v">{fmtDay(r.delivered_at) || "-"}</dd></div>
          <div><dt className="label">{tk("sample.detail.feedbackDueLabel")}</dt><dd className="v">{fmtDay(r.feedback_due) || "-"}</dd></div>
          <div><dt className="label">{tk("sample.detail.returnDueLabel")}</dt><dd className={`v ${r.return_due && stateKey === "state.sample.return_due" ? "text-warn" : ""}`}>{fmtDay(r.return_due) || "-"}</dd></div>
        </dl>

        <section className="mt-8">
          <div className="section-h"><h2>{tk("sample.detail.items.title")}<span className="count">{tk("sample.detail.qtySummary", { n: totalQty, k: items.length })}</span></h2></div>
          <ol>
            {items.map((i) => {
              const l = label(i.variant_id);
              const canFeedback = (r.status === "delivered" || r.status === "feedback_done") && i.status !== "unavailable";
              const canReturn = canFeedback && i.return_status === "due" && !i.return_requested_at && i.charge_status === "none";
              const offerStatus = data.offers.find((x) => x.id === i.offer_id)?.status;
              const showSide = canFeedback || canReturn || i.feedback === "interested" || !["delivered", "feedback_done", "closed", "cancelled"].includes(r.status);
              const pc = cover(l.productId);
              const img = i.inspection_photo_path ? photos[i.inspection_photo_path] : pc ? covers[pc] : null;
              // 검품·회수 결과를 한 문장씩(상태 점 없이)
              const notes = [
                i.status !== "pending" ? { warn: i.status !== "ok", text: `${tk(`sample.inspect.${i.status}`)}${i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}` } : null,
                i.return_status === "returned" ? { warn: false, text: tk("sample.return.done") } : null,
                i.return_requested_at && i.return_status !== "returned" ? { warn: false, text: tk("sample.return.requested", { t: i.return_tracking ?? "" }) } : null,
                i.return_status === "kept" && i.charge_status === "none" ? { warn: false, text: tk("sample.keep.pending") } : null,
                i.charge_status === "charged" ? { warn: true, text: tk("sample.charged", { n: krw(i.charged_krw) }) } : null,
              ].filter(Boolean) as { warn: boolean; text: string }[];
              return (
                <li key={i.id} className={`grid gap-x-8 gap-y-4 border-b border-line py-6 ${showSide ? "sm:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
                  <div className="flex min-w-0 gap-5">
                    <div className="w-20 shrink-0"><Photo src={img ?? null} alt={l.name ?? ""} /></div>
                    <div className="min-w-0 text-body">
                      {multi && <div className="text-lead font-medium">{l.name}</div>}
                      <div className={multi ? "num mt-0.5 text-meta text-ink-2" : "num text-lead font-medium"}>{l.variant} <span className="font-normal text-muted">{tk("sample.list.qty", { n: i.qty })}</span></div>
                      {notes.map((n, k) => <p key={k} className={`num mt-1.5 text-meta ${n.warn ? "text-warn" : "text-ink-2"}`}>{n.text}</p>)}
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
          {r.kr_tracking && <p className="num mt-4 text-meta text-ink-2">{tk("sample.detail.tracking", { t: r.kr_tracking })}</p>}
        </section>

        <div className="two half mt-12">
          <section>
            <div className="section-h" style={{ borderBottom: 0, paddingBottom: 12 }}><h2>{tk("detail.sofar")}</h2></div>
            {/* 전이 기록(audit_logs)이 있으면 그걸로, 없으면(이전 데이터) 단계 시각으로 */}
            <Timeline day rows={events.some((e) => e.kind === "transition")
              ? events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: tk(`status.sample_request.${e.to}`) }))
              : steps.map(([k, at]) => ({ at, label: tk(`sample.step.${k}`) }))} />
          </section>
          <CommentThread targetType="sample_request" targetId={id} viewer="brand" tabs={["brand"]} rows={comments} title={tk("detail.toWeare")} />
        </div>
      </div>

      <aside className="c4 min-w-0">
        <InvoiceSheet
          label={tk("sample.detail.billing")}
          total={r.logistics_fee_krw + charged}
          // 항목이 샘플비 하나뿐이면 내역을 내지 않는다 — 합계와 같은 숫자를 세 번 보이지 않게
          rows={charged > 0 ? [
            { label: tk("sample.new.logistics"), value: r.logistics_fee_krw },
            { label: tk("sample.detail.chargedProducts"), value: charged },
          ] : []}
          sumLabel={charged > 0 ? tk("order.invoice.sum") : tk("sample.new.logistics")}
          help={tk("sample.detail.billingHelp")}
        />
      </aside>
    </div>
  );
}
