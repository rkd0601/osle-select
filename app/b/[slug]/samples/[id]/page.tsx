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
import { fmtDay, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BackLink } from "../../_ui/list";
import { FeedbackChoice, ReportPayment, ReturnChoice, SampleHeaderActions } from "../sample-controls";

/**
 * B-07 샘플 상세 (디자인 v2.3 "샘플 상세"). 12칸: 왼쪽 8 — 메타 13("샘플 · 11월 4일 받음") · 제목 `{상품명} {n}장`
 * → 지금 상태 블록(`.nowblock`) → 입금 안내 → 할 일 하나(`.choice` + 버튼 하나) → 3칸 사실(받은 옵션 · 검품 · 내 피드백) → "지금까지" | "위아더에게".
 * 할 일: 받은 뒤(delivered) 관심/보류/거절 + "피드백 보내기", 피드백 뒤(feedback_done · 회수 대상) 돌려보낼게요/갖고 있을게요 + "회수 신청".
 * 그 밖의 상태는 지금 상태 + 사실만. 발주 담기는 진행 카드·발주서 작성에서(여기엔 없다). 오른쪽 4 — "샘플비" 청구표.
 * 상태 점·눈썹·#id·상품 코드 없음(d-11). 전이는 기존 서버 액션이 다시 검증한다(절대 규칙 4).
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
  // 대표 사진 = CN 편집 화면 1번(쿼리가 sort_order 순으로 정렬) — v2.3 T4
  const cover = (pid: string | undefined) => data.images.find((i) => i.product_id === pid)?.storage_path ?? null;
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
  type Item = (typeof items)[number];
  const charged = items.reduce((s, i) => s + (i.charge_status === "charged" ? i.charged_krw : 0), 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const products = items.map((i) => label(i.variant_id)).filter((p, k, xs) => p.productId && xs.findIndex((x) => x.productId === p.productId) === k);
  const multi = products.length > 1;
  const steps = [
    ["created", r.created_at], ["payment", r.payment_confirmed_at], ["cn_shipped", r.cn_shipped_at], ["kr_arrived", r.kr_arrived_at],
    ["inspected", r.inspected_at], ["sent", r.sent_at], ["delivered", r.delivered_at],
  ].filter(([, at]) => at) as [string, string][];

  // 항목별 할 일: 받은 뒤엔 피드백, 피드백 뒤엔 회수(둘 중 하나). 서버(giveSampleFeedback·setSampleReturn)가 같은 조건을 다시 본다.
  const canFeedback = (i: Item) => r.status === "delivered" && i.status !== "unavailable";
  const needsReturn = (i: Item) => r.status === "feedback_done" && i.status !== "unavailable" && i.return_status === "due" && !i.return_requested_at && i.charge_status === "none";
  const fee = (i: Item) => i.qty * (i.product_price_krw ?? 0);
  const returnFee = items.filter(needsReturn).reduce((s, i) => s + fee(i), 0);

  // 지금 상태: 사람 말 한 문장 + 다음 행동 한 문장 + 기한
  const paidReported = r.status === "awaiting_payment" && !!r.payment_reported_at;
  const h = paidReported ? null : handoffFor("sample_request", r.status);
  const stateKey = sampleStateKey(r, items);
  const mine = h?.owner === "BRAND" && (r.status !== "feedback_done" || stateKey === "state.sample.return_due");
  const dueAt = r.status === "delivered" ? r.feedback_due : r.status === "feedback_done" ? r.return_due : r.due_at;
  const nowSub = ["closed", "cancelled"].includes(r.status) ? null
    : stateKey === "state.sample.return_due" && returnFee > 0 && actor.canPurchase
      ? tk("sample.choice.returnSub", { date: fmtDay(r.return_due), n: krw(returnFee) })
      : oneLine([
        h && (r.status !== "feedback_done" || mine) ? tk(h.decide) : null,
        dueAt && (mine || r.status !== "feedback_done") ? tk(mine ? "state.until" : "state.on", { date: fmtDay(dueAt) }) : null,
      ]);
  const firstCover = cover(products[0]?.productId);
  const canCancel = next.includes("cancelled") && (!r.payment_confirmed_at || user.role === "ADMIN");
  const canReceive = r.status === "sent_to_brand";
  const name = products[0]?.name ?? tk("sample.new.title");

  // 3칸 사실 — 검품 · 내 피드백, 그 아래 회수 결과 한 줄(상태 점 없이 사람 말로)
  const inspectText = (i: Item) =>
    i.status === "ok" ? tk("sample.fact.inspect.ok")
      : i.status === "defect" ? tk("sample.fact.inspect.defect", { d: i.inspection_defect ? tk(`sample.defect.${i.inspection_defect}`) : tk("sample.inspect.defect") })
        : tk(`sample.inspect.${i.status}`);
  const feedbackText = (i: Item) => {
    if (i.feedback === "interested") {
      const os = data.offers.find((x) => x.id === i.offer_id)?.status;
      return data.orderedOfferIds.includes(i.offer_id) ? tk("sample.fact.feedback.ordered")
        : os === "expired" ? tk("sample.fact.feedback.expired") : tk("sample.fact.feedback.interested");
    }
    if (i.feedback === "hold") return tk("status.offer.hold");
    if (i.feedback === "declined") return i.feedback_reason ? tk("sample.fact.feedback.declined", { reason: tk(`decline.${i.feedback_reason}`) }) : tk("status.offer.declined");
    return tk("sample.fact.feedback.none");
  };
  const returnText = (i: Item) =>
    i.charge_status === "charged" ? tk("sample.charged", { n: krw(i.charged_krw) })
      : i.return_status === "returned" ? tk("sample.return.done")
        : i.return_requested_at ? tk("sample.return.requested", { t: i.return_tracking ?? "" })
          : i.return_status === "kept" ? tk("sample.keep.pending") : null;
  const received = r.delivered_at ? tk("sample.fact.metaReceived", { date: fmtDay(r.delivered_at) }) : tk("sample.detail.meta", { date: fmtDay(r.created_at) });

  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8 min-w-0">
        <p className="meta flex flex-wrap gap-x-2">
          <span>{received}</span>
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

        {items.map((i, k) => {
          const l = label(i.variant_id);
          const photo = i.inspection_photo_path ? photos[i.inspection_photo_path] : null;
          const back = returnText(i);
          const act = canFeedback(i) ? <FeedbackChoice brandId={brand.id} itemId={i.id} current={i.feedback} />
            : needsReturn(i) ? <ReturnChoice brandId={brand.id} itemId={i.id} productFee={krw(fee(i))} canPurchase={actor.canPurchase} /> : null;
          return (
            <section key={i.id} className={k === 0 ? "mt-6" : "mt-12"} aria-label={items.length > 1 ? `${l.name ?? ""} ${l.variant}` : undefined}>
              {items.length > 1 && <h2 className="mb-4 text-lead font-medium">{multi ? `${l.name ?? ""} · ` : ""}<span className="num">{l.variant}</span></h2>}
              {act}
              <dl className={`kv kv-facts ${act ? "mt-10" : ""}`} style={act ? undefined : { borderTop: 0, paddingTop: 0 }}>
                <div><dt className="label">{tk("sample.fact.option")}</dt><dd className="v">{tk("sample.fact.optionValue", { variant: l.variant || "-", n: i.qty })}</dd></div>
                <div>
                  <dt className="label">{tk("sample.fact.inspect")}</dt>
                  <dd className={`v ${i.status === "defect" || i.status === "unavailable" ? "text-warn" : ""}`}>{inspectText(i)}</dd>
                  {photo && <dd className="mt-1"><a href={photo} target="_blank" rel="noreferrer" className="link text-meta">{tk("sample.fact.inspectPhoto")}</a></dd>}
                </div>
                <div><dt className="label">{tk("sample.fact.feedback")}</dt><dd className="v">{feedbackText(i)}</dd></div>
              </dl>
              {back && <p className={`num mt-3 text-meta ${i.charge_status === "charged" ? "text-warn" : "text-ink-2"}`}>{back}</p>}
            </section>
          );
        })}
        {r.kr_tracking && <p className="num mt-4 text-meta text-ink-2">{tk("sample.detail.tracking", { t: r.kr_tracking })}</p>}

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
          label={tk("sample.fact.billing")}
          total={r.logistics_fee_krw + charged}
          // 항목이 샘플비 하나뿐이면 내역을 내지 않는다 — 합계와 같은 숫자를 세 번 보이지 않게
          rows={charged > 0 ? [
            { label: tk("sample.new.logistics"), value: r.logistics_fee_krw },
            { label: tk("sample.detail.chargedProducts"), value: charged },
          ] : []}
          sumLabel={charged > 0 ? tk("order.invoice.sum") : tk("sample.new.logistics")}
          help={returnFee > 0 && actor.canPurchase ? tk("sample.fact.billingHelpKeep", { n: krw(returnFee) }) : tk("sample.detail.billingHelp")}
        />
      </aside>
    </div>
  );
}
