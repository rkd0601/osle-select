import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandOrder } from "@/lib/db/brand/orders";
import { getBankAccount } from "@/lib/db/settings";
import { allowedNext } from "@/lib/transitions";
import { StatusPill } from "@/components/domain/status-pill";
import { Timeline } from "@/components/domain/timeline";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { OrderHeaderActions, QtyConfirmForm, ReportDeposit, ReportForm, type QtyOffer } from "./order-controls";

type Invoice = {
  groups: { offerId: string; qty: number; product_price_krw: number; unit_supply_krw: number; subtotal_krw: number; fee_krw: number }[];
  subtotal_krw: number; fee_krw: number; options_krw: number; sample_deduction_krw: number; deposit_paid_krw: number; credit_krw: number; logistics_final_krw: number | null; total_krw: number;
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

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Link href={`/b/${slug}/orders`} className="text-[12px] text-muted">{tk("common.back")}</Link>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink pb-3">
          <h1 className="text-[24px] font-bold tracking-tight">{tk("order.detail.title", { date: fmtDate(o.created_at) })}</h1>
          <StatusPill entity="order" status={o.status} />
        </div>
        {warn === "schedule" && <p className="bg-warn-soft px-3 py-2 text-[13px] text-warn">{tk("order.warn.schedule")}</p>}
        <p className="text-[13px] text-ink-2">{tk(`order.turn.${o.status}`)}</p>
        <OrderHeaderActions brandId={brand.id} orderId={o.id} canCancel={next.includes("cancelled")} canReceive={o.status === "sent_to_brand"} />

        <dl className="num grid grid-cols-3 gap-4 text-[13px]">
          <div><dt className="text-[11px] text-muted">{tk("order.field.gbOpen")}</dt><dd>{fmtDate(o.gb_open_date)}</dd></div>
          <div><dt className="text-[11px] text-muted">{tk("order.field.gbClose")}</dt><dd>{fmtDate(o.gb_close_date)}</dd></div>
          <div><dt className="text-[11px] text-muted">{tk("order.field.deliveryPromise")}</dt><dd>{fmtDate(o.delivery_promise_date)}</dd></div>
        </dl>
        <p className="text-[12px] text-ink-2">
          {o.hold_choice === "deposit" ? tk("order.detail.holdDeposit", { p: Math.round(Number(o.deposit_pct ?? 0) * 100) }) : tk("order.detail.holdNone")}
          {" · "}{tk(`order.route.${o.route}`)}
        </p>

        {o.status === "deposit_pending" && o.deposit_krw != null && (
          <PaymentNoticeCard kind="deposit" amount={o.deposit_krw} bank={bank} due={o.due_at} reportedAt={o.deposit_reported_at} confirmedAt={o.deposit_confirmed_at}>
            <ReportDeposit brandId={brand.id} orderId={o.id} />
          </PaymentNoticeCard>
        )}

        {range && o.status === "quoted" && (
          <section className="space-y-3 border-l-2 border-signature bg-surface px-5 py-4">
            <h2 className="text-[15px] font-bold">{tk("order.detail.rangeQuote")}</h2>
            <p className="num text-[20px] font-semibold">₩{krw(range.min_krw)} – ₩{krw(range.max_krw)}</p>
            <p className="text-[12px] text-ink-2">{tk("order.detail.rangeHelp")}</p>
            {o.quote_note && <p className="text-[12px] text-ink-2">{o.quote_note}</p>}
          </section>
        )}
        {o.status === "quoted" && (
          <QtyConfirmForm brandId={brand.id} orderId={o.id} offers={qtyOffers} canPurchase={actor.canPurchase} defaultRoute={o.route as "inspect" | "direct"} />
        )}

        {o.status !== "quoted" && (
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("order.detail.lines")}</h2>
            <table className="num mt-2 w-full text-[13px]">
              <thead className="text-left text-[11px] text-muted">
                <tr><th className="py-1 font-normal">{tk("order.detail.item")}</th><th className="text-right font-normal">{tk("order.detail.expected")}</th><th className="text-right font-normal">{tk("order.detail.secured")}</th><th className="text-right font-normal">{tk("order.detail.qty")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((l) => {
                  const p = productOf(l.offer_id);
                  return (
                    <tr key={l.id}>
                      <td className="py-1.5"><span className="text-muted">{p?.code}</span> {p?.name_ko} · {label(l.variant_id)}</td>
                      <td className="text-right">{l.expected_qty}</td>
                      <td className={`text-right ${l.stock_result === "short" ? "text-warn" : ""}`}>{l.stock_result === "pending" ? "—" : l.confirmed_qty ?? "—"}</td>
                      <td className="text-right font-semibold">{l.qty || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {backorders.length > 0 && (
          <section className="space-y-2 border-l-2 border-warn bg-surface px-4 py-3">
            <h2 className="text-[13px] font-semibold text-warn">{tk("order.detail.backorders")}</h2>
            {backorders.map((l) => {
              const log = (l.backorder_log ?? []) as { at: string; note: string; eta: string | null; qty: number }[];
              const last = log[log.length - 1];
              return (
                <div key={l.id} className="num text-[12px]">
                  <span className="font-medium">{productOf(l.offer_id)?.code} · {label(l.variant_id)}</span>{" "}
                  {l.backorder_status === "resolved" ? tk("order.backorder.resolved") : tk("order.backorder.line", { n: l.backorder_qty, date: fmtDate(l.backorder_eta) })}
                  {last && <p className="text-ink-2">{fmtDate(last.at)} · {last.note}</p>}
                </div>
              );
            })}
          </section>
        )}

        {o.kr_tracking && <p className="num text-[13px] text-ink-2">{tk("order.detail.tracking", { t: o.kr_tracking })}</p>}
        {o.status === "delivered" && (
          <>
            {o.report_due && <p className="num text-[13px] text-signature">{tk("order.detail.reportDue", { date: fmtDate(o.report_due) })}</p>}
            <ReportForm brandId={brand.id} orderId={o.id} lines={lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.id, label: `${productOf(l.offer_id)?.code ?? ""} · ${label(l.variant_id)}`, qty: l.qty }))} />
          </>
        )}
        {o.status === "report_done" && (
          <section className="bg-surface px-4 py-3 text-[13px]">
            <h2 className="font-semibold">{tk("order.detail.reportDone")}</h2>
            <p className="num mt-1 text-ink-2">{tk("order.detail.defects", { n: lines.reduce((s, l) => s + l.defect_qty, 0) })}</p>
            {o.credit_issued_krw > 0 ? <p className="num mt-1 text-signature">{tk("order.detail.credit", { n: krw(o.credit_issued_krw) })}</p> : <p className="mt-1 text-muted">{tk("order.detail.creditPending")}</p>}
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <section className="bg-surface p-4">
          <h2 className="text-[12px] font-semibold text-ink-2">{inv ? tk("order.invoice.fixed") : tk("order.invoice.pending")}</h2>
          {inv ? (
            <dl className="num mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
              <dt className="text-ink-2">{tk("order.invoice.subtotal")}</dt><dd>₩{krw(inv.subtotal_krw)}</dd>
              <dt className="text-ink-2">{tk("order.invoice.fee")}</dt><dd>₩{krw(inv.fee_krw)}</dd>
              {inv.options_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.options")}</dt><dd>₩{krw(inv.options_krw)}</dd></>}
              {inv.logistics_final_krw != null && <><dt className="text-ink-2">{tk("order.invoice.logistics")}</dt><dd>₩{krw(inv.logistics_final_krw)}</dd></>}
              {inv.sample_deduction_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.sampleDeduction")}</dt><dd>−₩{krw(inv.sample_deduction_krw)}</dd></>}
              {inv.deposit_paid_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.deposit")}</dt><dd>−₩{krw(inv.deposit_paid_krw)}</dd></>}
              {inv.credit_krw > 0 && <><dt className="text-ink-2">{tk("order.invoice.credit")}</dt><dd>−₩{krw(inv.credit_krw)}</dd></>}
              <dt className="border-t border-ink pt-1 font-semibold">{tk("order.invoice.total")}</dt><dd className="border-t border-ink pt-1 text-[18px] font-semibold">₩{krw(inv.total_krw)}</dd>
            </dl>
          ) : (
            <>
              {o.logistics_quote_final_krw != null && <p className="num mt-2 text-[13px]">{tk("order.invoice.logisticsFinal", { n: krw(o.logistics_quote_final_krw) })}</p>}
              <p className="mt-2 text-[11px] text-muted">{tk("order.invoice.pendingHelp")}</p>
            </>
          )}
          <p className="mt-2 text-[11px] text-muted">{tk("order.invoice.offPlatform")}</p>
        </section>
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("request.detail.timeline")}</h2>
          <div className="mt-3"><Timeline rows={steps.map(([k, at]) => ({ at, label: tk(`order.step.${k}`) }))} /></div>
        </section>
      </aside>
    </div>
  );
}
