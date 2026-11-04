import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandOrder } from "@/lib/db/brand/orders";
import { getBankAccount } from "@/lib/db/settings";
import { allowedNext } from "@/lib/transitions";
import { StatusPill } from "@/components/domain/status-pill";
import { Timeline } from "@/components/domain/timeline";
import { HandoffCard } from "@/components/domain/handoff-card";
import { handoffFor } from "@/lib/handoff";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { transitionEvents } from "@/lib/timeline";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { fmtDate, krw } from "@/lib/format";
import { finalInvoiceParts, latestFinalApproval, loadOrderForCalc } from "@/lib/db/admin/orders";
import { finalApprovalState } from "@/lib/orders";
import { tk } from "@/lib/i18n";
import { ApproveFinalQuote, BackorderChoice, OrderHeaderActions, QtyConfirmForm, ReportDeposit, ReportForm, type QtyOffer } from "./order-controls";

type Invoice = {
  groups: { offerId: string; qty: number; product_price_krw: number; unit_supply_krw: number; subtotal_krw: number; fee_krw: number }[];
  subtotal_krw: number; fee_krw: number; options_krw: number; sample_logistics_krw?: number; sample_deduction_krw: number; deposit_paid_krw: number; credit_krw: number; logistics_final_krw: number | null; total_krw: number; refund_due_krw?: number;
};

/**
 * B-08 발주서 상세 · B-09 진행·도착 검수 보고. 체인: 재고 확인 → (선금 → 홀딩) → 범위 견적 → **수량 확정(2단계)** → 최종 견적 → 확정 → 출고 → 검품 → 발송 → 검수 보고.
 * 금액은 확정 전엔 미리보기, 확정 뒤엔 고정된 청구 내역(invoice_snapshot). 결제는 플랫폼 밖(입금 신고까지).
 */
export default async function OrderDetail({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ warn?: string }> }) {
  const { slug, id } = await params;
  const { warn } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand, member } = await requireBrandMember(slug);
  const data = await getBrandOrder(brand.id, id);
  const [comments, events] = data ? await Promise.all([brandThread(brand.id, user.id, "order", id), transitionEvents("order", [id])]) : [[], []];
  if (!data) notFound();
  const { order: o, lines } = data;
  const actor = { role: user.role, canPurchase: member.level === "owner" || member.can_purchase };
  const next = allowedNext("order", o.status, actor);
  const bank = o.status === "deposit_pending" ? await getBankAccount() : null;

  const label = (variantId: string) => {
    const v = data.variants.find((x) => x.id === variantId);
    const c = v && data.colors.find((x) => x.id === v.color_id);
    const s = v && data.sizes.find((x) => x.id === v.size_id);
    return [c?.name_ko, s?.label].filter(Boolean).join(" / ");
  };
  const productOf = (offerId: string) => data.products.find((p) => p.id === data.offers.find((x) => x.id === offerId)?.product_id);
  const offerIds = [...new Set(lines.map((l) => l.offer_id))];
  const range = (o.logistics_quote_range ?? null) as { min_krw: number; max_krw: number } | null;
  const inv = (o.invoice_snapshot ?? null) as Invoice | null;
  // 최종 견적이 나오면 확정 전이라도 전체 청구 예상을 보여 준다 — 브랜드가 금액을 보고 코멘트로 이의를 낼 수 있게 (UX 검증 2026-11-04)
  const preview: Invoice | null = !inv && o.status === "final_quoted" ? await (async () => {
    const d = await loadOrderForCalc(o.id);
    if (!d || d.order.brand_id !== brand.id || d.offersChanged) return null; // 재확인 중이면 새 가격일 수 있어 미리보기를 내지 않는다(검증 B-1)
    return finalInvoiceParts(d).draft as Invoice; // 관리자 확정·브랜드 동의와 같은 계산 (u-10)
  })() : null;
  // 최종 견적 동의(u-10): 감사 로그는 서버에서만 읽는다. 지금 최종 견적 이후 + 총액 일치일 때만 "동의함"
  const approval = preview ? await latestFinalApproval(o.id) : null;
  const approved = !!preview && finalApprovalState(approval, o.final_quoted_at, preview.total_krw) === "ok";
  const shownInv = inv ?? preview;
  const backorders = lines.filter((l) => l.backorder_status !== "none");

  const qtyOffers: QtyOffer[] = offerIds.map((oid) => {
    const p = productOf(oid);
    const offer = data.offers.find((x) => x.id === oid);
    const labels = ((offer?.option_prices ?? null) as { labels?: { type: string; moq: number; unit_price_krw: number }[] } | null)?.labels ?? [];
    const ls = lines.filter((l) => l.offer_id === oid);
    return {
      offerId: oid, code: p?.code ?? null, name: p?.name_ko ?? null, minQty: p?.min_qty ?? null, labels,
      colors: data.colors.filter((c) => c.product_id === p?.id).map((c) => ({ id: c.id, name: c.name_ko ?? "", hex: c.hex })),
      sizes: data.sizes.filter((s) => s.product_id === p?.id).map((s) => ({ id: s.id, label: s.label })),
      cells: ls.flatMap((l) => {
        const v = data.variants.find((x) => x.id === l.variant_id);
        return v ? [{ lineId: l.id, variantId: v.id, colorId: v.color_id, sizeId: v.size_id, max: l.confirmed_qty ?? l.expected_qty, initial: l.qty || (l.confirmed_qty ?? l.expected_qty) }] : [];
      }),
    };
  });

  const steps = [
    ["created", o.created_at], ["deposit", o.deposit_confirmed_at], ["quoted", o.quoted_at], ["qty_confirmed", o.qty_confirmed_at], ["final_quoted", o.final_quoted_at],
    ["confirmed", o.confirmed_at], ["cn_shipped", o.cn_shipped_at], ["inspected", o.kr_inspected_at], ["sent", o.sent_at], ["delivered", o.delivered_at], ["reported", o.report_submitted_at],
  ].filter(([, at]) => at) as [string, string][];

  const totalQty = lines.reduce((s, l) => s + (l.qty || l.confirmed_qty || l.expected_qty), 0);

  return (
    <div className="space-y-6">
      <Link href={`/b/${slug}/orders`} className="btn btn-ghost btn-sm -ml-2">{tk("common.back")}</Link>
      <header className="border-b border-ink pb-4">
        <div className="eyebrow">{tk("eyebrow.orders")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-title font-bold tracking-tight">{tk("order.detail.title", { date: fmtDate(o.created_at) })}</h1>
          <StatusPill entity="order" status={o.status} />
          {["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"].includes(o.status) && (
            <Link href={`/b/${slug}/exports`} className="btn btn-secondary btn-sm ml-auto">{tk("nav.exports")} →</Link>
          )}
        </div>
        <p className="num mt-2 text-meta text-ink-2">
          {tk("order.list.qty", { n: totalQty })}
          {" · "}{o.hold_choice === "deposit" ? tk("order.detail.holdDeposit", { p: Math.round(Number(o.deposit_pct ?? 0) * 100) }) : tk("order.detail.holdNone")}
          {" · "}{tk(`order.route.${o.route}`)}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {(() => {
            const h = handoffFor("order", o.status, { depositReported: !!o.deposit_reported_at && !o.deposit_confirmed_at, finalApproved: approved });
            return h && <HandoffCard owner={h.owner} due={h.owner === "BRAND" ? (o.status === "delivered" ? o.report_due : o.due_at) : null} title={tk(h.title)} decide={tk(h.decide)} />;
          })()}
          {warn === "schedule" && <p className="rounded-ui bg-warn-soft px-3 py-2 text-body text-warn">{tk("order.warn.schedule")}</p>}
          {!(o.status === "deposit_pending" && o.deposit_reported_at) && !approved && <p className="text-body text-ink-2">{tk(`order.turn.${o.status}`)}</p>}
          <OrderHeaderActions brandId={brand.id} orderId={o.id} canCancel={next.includes("cancelled") && ((!o.deposit_confirmed_at && !o.deposit_reported_at) || user.role === "ADMIN")} canReceive={o.status === "sent_to_brand"} />

          <dl className="num grid grid-cols-3 gap-px overflow-hidden rounded-ui border border-line bg-line text-body">
            <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{tk("order.field.gbOpen")}</dt><dd className="mt-1 text-h4 font-semibold">{fmtDate(o.gb_open_date)}</dd></div>
            <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{tk("order.field.gbClose")}</dt><dd className="mt-1 text-h4 font-semibold">{fmtDate(o.gb_close_date)}</dd></div>
            <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{tk("order.field.deliveryPromise")}</dt><dd className="mt-1 text-h4 font-semibold">{fmtDate(o.delivery_promise_date)}</dd></div>
          </dl>

          {o.status === "deposit_pending" && o.deposit_krw != null && (
            <PaymentNoticeCard kind="deposit" amount={o.deposit_krw} bank={bank} due={o.due_at} reportedAt={o.deposit_reported_at} confirmedAt={o.deposit_confirmed_at}>
              <ReportDeposit brandId={brand.id} orderId={o.id} />
            </PaymentNoticeCard>
          )}

          {range && o.status === "quoted" && (
            <section className="card relative space-y-2 overflow-hidden px-5 py-4">
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signature" />
              <h2 className="eyebrow text-signature">{tk("order.detail.rangeQuote")}</h2>
              <p className="num text-title font-semibold tracking-tight">₩{krw(range.min_krw)} – ₩{krw(range.max_krw)}</p>
              <p className="text-meta text-ink-2">{tk("order.detail.rangeHelp")}</p>
              {o.quote_note && <p className="text-meta text-ink-2">{o.quote_note}</p>}
            </section>
          )}
          {o.status === "quoted" && (
            <QtyConfirmForm brandId={brand.id} orderId={o.id} offers={qtyOffers} canPurchase={actor.canPurchase} defaultRoute={o.route as "inspect" | "direct"} />
          )}

          {o.status !== "quoted" && (
            <section>
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <h2 className="eyebrow">{tk("order.detail.lines")}</h2>
                <span className="num text-caption text-ink-2">{tk("order.list.qty", { n: totalQty })}</span>
              </div>
              <div className="mt-3 max-w-full overflow-x-auto rounded-ui border border-line">
                <table className="table-ui num">
                  <thead>
                    <tr><th>{tk("order.detail.item")}</th><th className="text-right">{tk("order.detail.expected")}</th><th className="text-right">{tk("order.detail.secured")}</th><th className="text-right">{tk("order.detail.qty")}</th></tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const p = productOf(l.offer_id);
                      return (
                        <tr key={l.id}>
                          <td className="min-w-48"><span className="block text-caption text-muted">{p?.code}</span><span className="font-medium">{p?.name_ko}</span> <span className="text-ink-2">· {label(l.variant_id)}</span></td>
                          <td className="text-right text-ink-2">{l.expected_qty}</td>
                          <td className={`text-right ${l.stock_result === "short" ? "font-semibold text-warn" : ""}`}>{l.stock_result === "pending" ? "—" : l.confirmed_qty ?? "—"}</td>
                          <td className="text-right font-semibold">{l.qty || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {lines.some((l) => l.stock_result === "short") && (
                <p className="mt-2 text-caption text-warn">{tk("order.detail.partialStock", { items: lines.filter((l) => l.stock_result === "short").map((l) => `${label(l.variant_id)} ${l.expected_qty}→${l.confirmed_qty ?? 0}`).join(", ") })}</p>
              )}
            </section>
          )}

          {backorders.length > 0 && (
            <section className="card relative space-y-3 overflow-hidden px-5 py-4">
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-warn" />
              <h2 className="text-strong font-semibold text-warn">{tk("order.detail.backorders")}</h2>
              {backorders.map((l) => {
                const log = (l.backorder_log ?? []) as { at: string; note?: string; eta?: string | null; qty?: number; by?: string; choice?: string }[];
                const last = log.filter((x) => x.by !== "brand").at(-1);
                const choice = log.filter((x) => x.by === "brand").at(-1)?.choice ?? null;
                const days = l.backorder_eta ? Math.max(0, Math.ceil((new Date(`${l.backorder_eta}T00:00:00+09:00`).getTime() - Date.now()) / 86400000)) : null;
                return (
                  <div key={l.id} className="num border-t border-line pt-3 text-meta first:border-t-0 first:pt-0">
                    <span className="font-medium">{productOf(l.offer_id)?.code} · {label(l.variant_id)}</span>{" "}
                    {l.backorder_status === "resolved" ? tk("order.backorder.resolved") : tk("order.backorder.line", { n: l.backorder_qty, date: fmtDate(l.backorder_eta) })}
                    {days != null && l.backorder_status === "backordered" && <span className="ml-1 text-warn">{tk("order.backorder.days", { n: days })}</span>}
                    {last?.note && <p className="text-ink-2">{fmtDate(last.at)} · {last.note}</p>}
                    {l.backorder_status === "backordered" && <BackorderChoice brandId={brand.id} lineId={l.id} current={choice} />}
                  </div>
                );
              })}
            </section>
          )}

          {data.inspection && (
            <section className="card card-pad space-y-3">
              <h2 className="eyebrow">{tk("order.report.title")}</h2>
              <p className="num text-title font-bold leading-none">{data.inspection.info_match_rate != null ? tk("order.report.rate", { n: Number(data.inspection.info_match_rate) }) : "—"}</p>
              <p className="num text-meta text-ink-2">{tk("order.report.meta", { date: fmtDate(data.inspection.inspected_at), n: data.inspection.defect_qty })}</p>
              <ul className="divide-y divide-line border-y border-line text-body">
                {((data.inspection.results ?? []) as { field: string; expected: string; actual: string; match: boolean }[]).map((r) => {
                  const [code, f] = r.field.includes(":") ? r.field.split(":") : ["", r.field];
                  return (
                    <li key={r.field} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2">
                      <span><span className="num text-muted">{code}</span> {tk(`order.report.field.${f}`)} · <span className="text-ink-2">{r.expected}</span>{!r.match && r.actual && <span className="text-warn"> → {r.actual}</span>}</span>
                      <span className={r.match ? "text-ink-2" : "font-semibold text-warn"}>{tk(r.match ? "inspect.match" : "inspect.mismatch")}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {o.kr_tracking && <p className="num text-body text-ink-2">{tk("order.detail.tracking", { t: o.kr_tracking })}</p>}
          {o.status === "delivered" && (
            <>
              {o.report_due && <p className="num inline-flex rounded-full bg-signature-soft px-3 py-1 text-meta font-medium text-signature">{tk("order.detail.reportDue", { date: fmtDate(o.report_due) })}</p>}
              <ReportForm brandId={brand.id} orderId={o.id} lines={lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.id, label: `${productOf(l.offer_id)?.code ?? ""} · ${label(l.variant_id)}`, qty: l.qty }))} />
            </>
          )}
          {o.status === "report_done" && (
            <section className="card card-pad text-body">
              <h2 className="font-semibold">{tk("order.detail.reportDone")}</h2>
              <p className="num mt-1 text-ink-2">{tk("order.detail.defects", { n: lines.reduce((s, l) => s + l.defect_qty, 0) })}</p>
              {o.credit_issued_krw > 0 ? <p className="num mt-1 text-signature">{tk("order.detail.credit", { n: krw(o.credit_issued_krw) })}</p> : <p className="mt-1 text-ink-2">{tk("order.detail.creditPending")}</p>}
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <section className="card card-pad">
              <h2 className="eyebrow">{tk("request.detail.timeline")}</h2>
              <div className="mt-4"><Timeline rows={events.some((e) => e.kind === "transition")
                ? events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: tk(`status.order.${e.to}`) }))
                : steps.map(([k, at]) => ({ at, label: tk(`order.step.${k}`) }))} /></div>
            </section>
            <div className="card card-pad">
              <CommentThread targetType="order" targetId={id} viewer="brand" tabs={["brand"]} rows={comments} />
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card card-pad">
            <h2 className="eyebrow">{inv ? tk("order.invoice.fixed") : preview ? tk("order.invoice.previewFinal") : tk("order.invoice.pending")}</h2>
            {shownInv ? (
              <>
                <div className="num mt-2 text-title font-semibold leading-none tracking-tight">₩{krw(shownInv.total_krw)}</div>
                <dl className="num mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-3 text-body">
                  <dt className="text-ink-2">{tk("order.invoice.subtotal")}</dt><dd>₩{krw(shownInv.subtotal_krw)}</dd>
                  <dt className="text-ink-2">{tk("order.invoice.fee")}</dt><dd>₩{krw(shownInv.fee_krw)}</dd>
                  {shownInv.options_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.options")}</dt><dd>₩{krw(shownInv.options_krw)}</dd></>}
                  {shownInv.logistics_final_krw != null && <><dt className="text-ink-2">{tk("order.invoice.logistics")}</dt><dd>₩{krw(shownInv.logistics_final_krw)}</dd></>}
                  {(shownInv.sample_logistics_krw ?? 0) > 0 && <><dt className="text-ink-2">{tk("order.invoice.sampleLogistics")}</dt><dd>₩{krw(shownInv.sample_logistics_krw!)}</dd></>}
                  {shownInv.sample_deduction_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.sampleDeduction")}</dt><dd>−₩{krw(shownInv.sample_deduction_krw)}</dd></>}
                  {shownInv.deposit_paid_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.deposit")}</dt><dd>−₩{krw(shownInv.deposit_paid_krw)}</dd></>}
                  {shownInv.credit_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.credit")}</dt><dd>−₩{krw(shownInv.credit_krw)}</dd></>}
                  <dt className="border-t border-ink pt-1.5 font-semibold">{tk("order.invoice.total")}</dt><dd className="border-t border-ink pt-1.5 text-h3 font-semibold">₩{krw(shownInv.total_krw)}</dd>
                  {(shownInv.refund_due_krw ?? 0) > 0 && <><dt className="text-signature">{tk("order.invoice.refundDue")}</dt><dd className="text-signature">₩{krw(shownInv.refund_due_krw!)}</dd></>}
                </dl>
              </>
            ) : (
              <>
                {o.logistics_quote_final_krw != null && <p className="num mt-2 text-body">{tk("order.invoice.logisticsFinal", { n: krw(o.logistics_quote_final_krw) })}</p>}
                <p className="mt-2 text-caption text-muted">{tk("order.invoice.pendingHelp")}</p>
              </>
            )}
            {preview && (
              <div className="mt-4 border-t border-line pt-4">
                {approved ? (
                  <p className="rounded-ui bg-signature-soft px-3 py-2 text-body text-signature">{tk("order.approve.done", { date: fmtDate(approval!.at, "ko", true) })}</p>
                ) : actor.canPurchase ? (
                  <ApproveFinalQuote brandId={brand.id} orderId={o.id} total={preview.total_krw} />
                ) : (
                  <p className="text-meta text-warn">{tk("order.approve.noPurchase")}</p>
                )}
                {!approved && <p className="mt-2 text-caption text-muted">{tk("order.approve.help")}</p>}
              </div>
            )}
            <p className="mt-3 text-caption text-muted">{tk("order.invoice.offPlatform")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
