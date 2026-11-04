import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandOrder } from "@/lib/db/brand/orders";
import { getBankAccount } from "@/lib/db/settings";
import { allowedNext } from "@/lib/transitions";
import { StatusDot } from "@/components/domain/status-pill";
import { Timeline } from "@/components/domain/timeline";
import { HandoffCard } from "@/components/domain/handoff-card";
import { InvoiceSheet } from "@/components/domain/invoice-sheet";
import { handoffFor } from "@/lib/handoff";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { transitionEvents } from "@/lib/timeline";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { fmtDate, krw } from "@/lib/format";
import { finalInvoiceParts, latestFinalApproval, loadOrderForCalc } from "@/lib/db/admin/orders";
import { finalApprovalState } from "@/lib/orders";
import { tk } from "@/lib/i18n";
import { BackLink, bundleTitle, shortId } from "../../_ui/list";
import { ApproveFinalQuote, BackorderChoice, OrderHeaderActions, QtyConfirmForm, ReportDeposit, ReportForm, type QtyOffer } from "./order-controls";

type Invoice = {
  groups: { offerId: string; qty: number; product_price_krw: number; unit_supply_krw: number; subtotal_krw: number; fee_krw: number }[];
  subtotal_krw: number; fee_krw: number; options_krw: number; sample_logistics_krw?: number; sample_deduction_krw: number; deposit_paid_krw: number; credit_krw: number; logistics_final_krw: number | null; total_krw: number; refund_due_krw?: number;
};

/**
 * B-08 발주서 상세 · B-09 진행·도착 검수 보고 (디자인 v2 §5). 체인: 재고 확인 → (선금 → 홀딩) → 범위 견적 → 수량 확정 → 최종 견적 → 확정 → 출고 → 검품 → 발송 → 검수 보고.
 * 제목 `{첫 상품명} 외 n · {수량}장`, 눈썹 `발주 · 날짜 · #id`, 부제 홀딩·경로. 핸드오프 → 일정 3칸 → 수량 표 → 진행 기록 | 코멘트. 오른쪽 청구표(유일한 상자).
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
  const products = offerIds.map(productOf).filter((p, i, xs) => p && xs.findIndex((x) => x?.id === p.id) === i);
  const title = bundleTitle({ firstName: products[0]?.name_ko ?? null, more: Math.max(0, products.length - 1) }, totalQty, tk("order.detail.title", { date: fmtDate(o.created_at) }));
  const afterConfirm = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"].includes(o.status);

  // 핸드오프: 템플릿이 있으면 그것, 없으면(진행 중 상태) 지금 차례인 쪽 + 한 줄 상태 문장. 문장은 하나만 (디자인 v2)
  const h = handoffFor("order", o.status, { depositReported: !!o.deposit_reported_at && !o.deposit_confirmed_at, finalApproved: approved });
  const handoff = h
    ? <HandoffCard owner={h.owner} due={h.owner === "BRAND" ? (o.status === "delivered" ? o.report_due : o.due_at) : (o.due_at ?? null)} title={tk(h.title)} decide={tk(h.decide)} />
    : o.owner_role === "ADMIN" || o.owner_role === "CN"
      ? <HandoffCard owner={o.owner_role as "ADMIN" | "CN"} due={o.due_at} title={tk(`order.turn.${o.status}`)} />
      : null;
  const short = lines.filter((l) => l.stock_result === "short");

  const invRows = shownInv ? [
    { label: tk("order.invoice.subtotalQty", { n: totalQty }), value: shownInv.subtotal_krw },
    { label: tk("order.invoice.fee"), value: shownInv.fee_krw },
    { label: tk("order.invoice.options"), value: shownInv.options_krw, hidden: !(shownInv.options_krw > 0) },
    { label: tk("order.invoice.logistics"), value: shownInv.logistics_final_krw ?? 0, hidden: shownInv.logistics_final_krw == null },
    { label: tk("order.invoice.sampleLogistics"), value: shownInv.sample_logistics_krw ?? 0, hidden: !((shownInv.sample_logistics_krw ?? 0) > 0) },
    { label: tk("order.invoice.sampleDeduction"), value: shownInv.sample_deduction_krw, minus: true, hidden: !(shownInv.sample_deduction_krw > 0) },
    { label: tk("order.invoice.deposit"), value: shownInv.deposit_paid_krw, minus: true, hidden: !(shownInv.deposit_paid_krw > 0) },
    { label: tk("order.invoice.credit"), value: shownInv.credit_krw, minus: true, hidden: !(shownInv.credit_krw > 0) },
  ] : [];

  const refund = shownInv?.refund_due_krw ?? 0;
  const invExtra = refund > 0 || (preview && !approved) ? (
    <>
      {refund > 0 && <p className="num text-meta text-ink-2">{tk("order.invoice.refundDue")} ₩{krw(refund)}</p>}
      {preview && !approved && (actor.canPurchase ? (
        <div className={refund > 0 ? "mt-4" : undefined}>
          <ApproveFinalQuote brandId={brand.id} orderId={o.id} total={preview.total_krw} />
          <p className="mt-2 text-caption text-muted">{tk("order.approve.help")}</p>
        </div>
      ) : (
        <p className="text-meta text-warn">{tk("order.approve.noPurchase")}</p>
      ))}
    </>
  ) : undefined;

  return (
    <div>
      <BackLink href={`/b/${slug}/orders`} label={tk("nav.orders")} />
      <div className="two mt-5">
        <div className="stack min-w-0">
          <div>
            <div className="phead" style={{ borderBottom: 0, paddingBottom: 0 }}>
              <div className="min-w-0">
                <div className="eyebrow">{tk("order.detail.eyebrow", { date: fmtDate(o.created_at), id: shortId(o.id) })}</div>
                <h1 className="h1 mt-3">{title}</h1>
                <p className="sub">
                  {o.hold_choice === "deposit" ? tk("order.detail.holdDeposit", { p: Math.round(Number(o.deposit_pct ?? 0) * 100) }) : tk("order.detail.holdNone")}
                  {" · "}{tk(`order.route.${o.route}`)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-4 pb-1.5">
                <StatusDot entity="order" status={o.status} />
                {afterConfirm && <Link href={`/b/${slug}/exports`} className="btn sec sm">{tk("nav.exports")}</Link>}
              </div>
            </div>
            {handoff && <div className="mt-7">{handoff}</div>}
            {warn === "schedule" && <p className="mt-4 text-meta text-warn">{tk("order.warn.schedule")}</p>}
            <div className="mt-4 empty:hidden">
              <OrderHeaderActions brandId={brand.id} orderId={o.id} canCancel={next.includes("cancelled") && ((!o.deposit_confirmed_at && !o.deposit_reported_at) || user.role === "ADMIN")} canReceive={o.status === "sent_to_brand"} />
            </div>
          </div>

          {o.status === "deposit_pending" && o.deposit_krw != null && (
            <PaymentNoticeCard kind="deposit" amount={o.deposit_krw} bank={bank} due={o.due_at} reportedAt={o.deposit_reported_at} confirmedAt={o.deposit_confirmed_at}>
              <ReportDeposit brandId={brand.id} orderId={o.id} />
            </PaymentNoticeCard>
          )}

          <dl className="kv">
            <div><dt className="label">{tk("order.field.gbOpen")}</dt><dd className="v">{fmtDate(o.gb_open_date)}</dd></div>
            <div><dt className="label">{tk("order.field.gbClose")}</dt><dd className="v">{fmtDate(o.gb_close_date)}</dd></div>
            <div><dt className="label">{tk("order.field.deliveryPromise")}</dt><dd className="v">{fmtDate(o.delivery_promise_date)}</dd></div>
          </dl>

          {range && o.status === "quoted" && (
            <section>
              <div className="label">{tk("order.detail.rangeQuote")}</div>
              <p className="num mt-2.5 text-h1 font-light tracking-[-0.03em]">₩{krw(range.min_krw)} – ₩{krw(range.max_krw)}</p>
              <p className="mt-2 text-meta text-ink-2">{tk("order.detail.rangeHelp")}</p>
              {o.quote_note && <p className="mt-1 text-meta text-ink-2">{o.quote_note}</p>}
            </section>
          )}
          {o.status === "quoted" && (
            <QtyConfirmForm brandId={brand.id} orderId={o.id} offers={qtyOffers} canPurchase={actor.canPurchase} defaultRoute={o.route as "inspect" | "direct"} />
          )}

          {o.status !== "quoted" && (
            <section>
              <div className="section-h" style={{ borderBottom: 0, paddingBottom: 16 }}><h2>{tk("order.detail.lines")}<span className="count">{tk("order.list.qty", { n: totalQty })}</span></h2></div>
              <div className="max-w-full overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr><th>{tk("order.detail.item")}</th><th className="r">{tk("order.detail.expected")}</th><th className="r">{tk("order.detail.secured")}</th><th className="r">{tk("order.detail.qty")}</th></tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const p = productOf(l.offer_id);
                      return (
                        <tr key={l.id}>
                          <td className="min-w-48 pr-4"><span className="code">{p?.code}</span>{p?.name_ko} <span className="text-ink-2">· {label(l.variant_id)}</span></td>
                          <td className="r pl-4 text-ink-2">{l.expected_qty}</td>
                          <td className={`r pl-4 ${l.stock_result === "short" ? "short" : ""}`}>{l.stock_result === "pending" ? "-" : l.confirmed_qty ?? "-"}</td>
                          <td className="r strong pl-4">{l.qty || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {short.length > 0 && (
                <p className="mt-3 text-meta text-warn">{tk("order.detail.partialStock", { items: short.map((l) => tk("order.detail.shortItem", { v: label(l.variant_id), n: l.confirmed_qty ?? 0 })).join(", ") })}</p>
              )}
            </section>
          )}

          {backorders.length > 0 && (
            <section>
              <div className="section-h"><h2 className="text-warn">{tk("order.detail.backorders")}<span className="count">{backorders.length}</span></h2></div>
              {backorders.map((l) => {
                const log = (l.backorder_log ?? []) as { at: string; note?: string; eta?: string | null; qty?: number; by?: string; choice?: string }[];
                const last = log.filter((x) => x.by !== "brand").at(-1);
                const choice = log.filter((x) => x.by === "brand").at(-1)?.choice ?? null;
                const days = l.backorder_eta ? Math.max(0, Math.ceil((new Date(`${l.backorder_eta}T00:00:00+09:00`).getTime() - Date.now()) / 86400000)) : null;
                return (
                  <div key={l.id} className="border-b border-line py-4 text-body">
                    <p className="num">
                      <span className="font-medium">{productOf(l.offer_id)?.code} · {label(l.variant_id)}</span>{" "}
                      {l.backorder_status === "resolved" ? tk("order.backorder.resolved") : tk("order.backorder.line", { n: l.backorder_qty, date: fmtDate(l.backorder_eta) })}
                      {days != null && l.backorder_status === "backordered" && <span className="ml-1 text-warn">{tk("order.backorder.days", { n: days })}</span>}
                    </p>
                    {last?.note && <p className="num mt-1 text-meta text-ink-2">{fmtDate(last.at)} · {last.note}</p>}
                    {l.backorder_status === "backordered" && <BackorderChoice brandId={brand.id} lineId={l.id} current={choice} />}
                  </div>
                );
              })}
            </section>
          )}

          {data.inspection && (
            <section>
              <div className="section-h"><h2>{tk("order.report.title")}<span className="count">{tk("order.report.meta", { date: fmtDate(data.inspection.inspected_at), n: data.inspection.defect_qty })}</span></h2></div>
              <p className="num mt-5 text-display font-light leading-none tracking-[-0.03em]">{data.inspection.info_match_rate != null ? tk("order.report.rate", { n: Number(data.inspection.info_match_rate) }) : "-"}</p>
              <table className="tbl mt-5">
                <tbody>
                  {((data.inspection.results ?? []) as { field: string; expected: string; actual: string; match: boolean }[]).map((r) => {
                    const [code, f] = r.field.includes(":") ? r.field.split(":") : ["", r.field];
                    return (
                      <tr key={r.field}>
                        <td className="pr-4">{code && <span className="code">{code}</span>}{tk(`order.report.field.${f}`)} · <span className="text-ink-2">{r.expected}</span>{!r.match && r.actual && <span className="text-warn"> · {r.actual}</span>}</td>
                        <td className={`r ${r.match ? "text-ink-2" : "short strong"}`}>{tk(r.match ? "inspect.match" : "inspect.mismatch")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
          {o.kr_tracking && <p className="num -mt-6 text-meta text-ink-2">{tk("order.detail.tracking", { t: o.kr_tracking })}</p>}
          {o.status === "delivered" && (
            <ReportForm brandId={brand.id} orderId={o.id} due={o.report_due ? tk("order.detail.reportDue", { date: fmtDate(o.report_due) }) : null}
              lines={lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.id, label: `${productOf(l.offer_id)?.code ?? ""} · ${label(l.variant_id)}`, qty: l.qty }))} />
          )}
          {o.status === "report_done" && (
            <section>
              <div className="section-h"><h2>{tk("order.detail.reportDone")}</h2></div>
              <p className="num mt-4 text-body">{tk("order.detail.defects", { n: lines.reduce((s, l) => s + l.defect_qty, 0) })}</p>
              <p className="num mt-1 text-meta text-ink-2">{o.credit_issued_krw > 0 ? tk("order.detail.credit", { n: krw(o.credit_issued_krw) }) : tk("order.detail.creditPending")}</p>
            </section>
          )}

          <div className="two half">
            <section>
              <div className="section-h" style={{ borderBottom: 0, paddingBottom: 16 }}><h2>{tk("request.detail.timeline")}</h2></div>
              <Timeline rows={events.some((e) => e.kind === "transition")
                ? events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: tk(`status.order.${e.to}`) }))
                : steps.map(([k, at]) => ({ at, label: tk(`order.step.${k}`) }))} />
            </section>
            <CommentThread targetType="order" targetId={id} viewer="brand" tabs={["brand"]} rows={comments} />
          </div>
        </div>

        <aside className="min-w-0">
          <InvoiceSheet
            label={inv ? tk("order.invoice.fixed") : preview ? tk("order.invoice.previewFinal") : tk("order.invoice.pending")}
            total={shownInv?.total_krw ?? null}
            rows={invRows}
            sumLabel={tk("order.invoice.total")}
            empty={o.logistics_quote_final_krw != null ? <span className="num">{tk("order.invoice.logisticsFinal", { n: krw(o.logistics_quote_final_krw) })}</span> : tk("order.invoice.pendingHelp")}
            note={approved ? tk("order.approve.done", { date: fmtDate(approval!.at, "ko", true) }) : null}
            help={tk("order.invoice.offPlatform")}
          >
            {invExtra}
          </InvoiceSheet>
        </aside>
      </div>
    </div>
  );
}
