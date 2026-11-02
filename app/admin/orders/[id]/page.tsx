import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrderForAdmin } from "@/lib/db/admin/orders";
import { bulkCriteria, creditAmount, orderDeposit, orderInvoice, orderOptionLines } from "@/lib/orders";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BackorderEditor, BulkInspectionForm, OrderStepControls } from "./admin-order-controls";
import { CommentThread } from "@/components/domain/comment-thread";
import { adminThread } from "@/lib/db/comments";
import { requireRole } from "@/lib/auth/session";

/**
 * A-06 발주 상세: 체인 단계별 다음 행동 하나 + 라인(예상·확보·확정·출고) + 금액 미리보기(확정 전) / 고정 청구 내역(확정 후) + 검품 + 미송 + 감사 로그.
 */
export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const me = await requireRole(["ADMIN"], "/admin");
  const d = await getOrderForAdmin(id);
  if (!d) notFound();
  const o = d.order;
  const brand = (Array.isArray(o.brands) ? o.brands[0] : o.brands) as { name: string; slug: string; credit_balance_krw: number } | null;
  const vlabel = (variantId: string, zh = false) => {
    const v = d.variants.find((x) => x.id === variantId);
    const c = v && d.colors.find((x) => x.id === v.color_id);
    const s = v && d.sizes.find((x) => x.id === v.size_id);
    return [zh ? c?.name_zh : c?.name_ko, s?.label].filter(Boolean).join(" / ");
  };
  const productOf = (offerId: string) => d.products.find((p) => p.id === d.offers.find((x) => x.id === offerId)?.product_id);
  const qtyByOffer = new Map(d.groups.map((g) => [g.offerId, g.lines.reduce((n, l) => n + l.qty, 0)]));
  const options = orderOptionLines({
    optionPrices: d.offers.map((x) => ({ offerId: x.id, option_prices: x.option_prices })),
    labels: (o.label_selections ?? []) as { offerId: string; type: string; qty: number }[],
    mods: (o.mod_requests ?? []) as { offerId: string; item: string }[], qtyByOffer,
  });
  const preview = orderInvoice({ groups: d.groups, options, keptSamples: d.keptSamples, deposit_paid_krw: o.deposit_confirmed_at ? (o.deposit_krw ?? 0) : 0, logistics_final_krw: o.logistics_quote_final_krw, sample_logistics: d.sampleLogistics });
  const inv = (o.invoice_snapshot ?? null) as typeof preview | null;
  const shown = inv ?? preview;
  const depositSuggest = o.deposit_pct ? orderDeposit(d.groups.map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, qty: d.lines.find((x) => x.id === l.lineId)?.confirmed_qty ?? l.qty })) })), Number(o.deposit_pct)) : null;
  const criteria = d.products.flatMap((p) => bulkCriteria(
    { fabric: p.fabric as { material_code: string; pct: number }[] | null, origin: p.origin, care_codes: p.care_codes },
    d.colors.filter((c) => c.product_id === p.id).map((c) => c.name_ko ?? ""), // 결과는 브랜드 리포트로 나간다 — _zh 금지(규칙 1)
    d.sizes.filter((s) => s.product_id === p.id).map((s) => s.label),
  ).map((c) => ({ ...c, field: `${p.code}:${c.field}` })));
  const range = (o.logistics_quote_range ?? null) as { min_krw: number; max_krw: number } | null;
  const mods = (o.mod_requests ?? []) as { offerId: string; item: string; note?: string }[];
  const inspection = d.inspection as { results: { field: string; expected: string; actual: string; match: boolean }[]; info_match_rate: number | null; defect_qty: number } | null;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/admin/orders" className="text-meta text-muted">{tk("common.back")}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h2 font-bold">{brand?.name} · {fmtDate(o.created_at)}</h1>
        <StatusPill entity="order" status={o.status} />
        {o.admin_waived && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">{tk("admin.orders.waived")}</span>}
        <Link href={`/b/${brand?.slug}/orders/${o.id}`} className="text-meta text-signature">{tk("admin.orders.asBrand")}</Link>
      </div>
      <p className="num text-meta text-ink-2">
        {tk("order.field.gbClose")} {fmtDate(o.gb_close_date)} · {tk("order.field.deliveryPromise")} {fmtDate(o.delivery_promise_date)} ·{" "}
        {o.hold_choice === "deposit" ? tk("order.detail.holdDeposit", { p: Math.round(Number(o.deposit_pct ?? 0) * 100) }) : tk("order.detail.holdNone")} · {tk(`order.route.${o.route}`)}
        {o.deposit_note && ` · ${tk("admin.orders.depositNote", { t: o.deposit_note })}`}
      </p>
      {mods.length > 0 && (
        <p className="text-meta text-ink-2">{tk("order.new.mods")}: {mods.map((m) => `${productOf(m.offerId)?.code ?? ""} ${tk(`product.option.mod.${m.item}`)}${m.note ? ` (${m.note})` : ""}`).join(" · ")}</p>
      )}

      <OrderStepControls
        hasInvoice={!!o.invoice_snapshot}
        orderId={o.id} status={o.status} holdChoice={o.hold_choice} route={o.route} depositSuggest={depositSuggest} depositReported={!!o.deposit_reported_at}
        range={range} finalQuote={o.logistics_quote_final_krw} total={preview.total_krw} hasInspection={!!o.inspection_id}
        creditSuggest={creditAmount(d.lines)} creditIssued={o.credit_issued_krw}
      />

      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("order.detail.lines")}</h2>
        <table className="num mt-2 w-full text-body">
          <thead className="text-left text-caption text-muted">
            <tr>
              <th className="py-1 font-normal">{tk("order.detail.item")}</th><th className="text-right font-normal">{tk("order.detail.expected")}</th>
              <th className="text-right font-normal">{tk("order.detail.secured")}</th><th className="text-right font-normal">{tk("order.detail.qty")}</th>
              <th className="text-right font-normal">{tk("admin.orders.unit")}</th><th className="pl-3 text-left font-normal">{tk("admin.orders.cn")}</th><th className="font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.lines.map((l) => {
              const p = productOf(l.offer_id);
              return (
                <tr key={l.id} className="align-top">
                  <td className="py-1.5"><span className="text-muted">{p?.code}</span> {p?.name_ko} · {vlabel(l.variant_id)}</td>
                  <td className="text-right">{l.expected_qty}</td>
                  <td className={`text-right ${l.stock_result === "short" ? "text-warn" : ""}`}>{l.stock_result === "pending" ? "—" : l.confirmed_qty}</td>
                  <td className="text-right font-semibold">{l.qty || "—"}</td>
                  <td className="text-right">{l.unit_price_krw != null ? `₩${krw(l.unit_price_krw)}` : ""}</td>
                  <td className="pl-3 text-caption text-ink-2">{(() => { const c = ((l.backorder_log ?? []) as { by?: string; choice?: string }[]).filter((x) => x.by === "brand").at(-1)?.choice; return c ? `${tk(`order.backorder.choice.${c}`)} · ` : ""; })()}{l.cn_note}{l.cn_shipped_at ? ` · ${tk("admin.orders.shipped", { t: l.cn_tracking ?? "" })}` : ""}</td>
                  <td className="pl-2">{["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"].includes(o.status) && <BackorderEditor lineId={l.id} status={l.backorder_status} qty={l.backorder_qty} eta={l.backorder_eta} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {o.status === "kr_inspecting" && !o.inspection_id && (
        <BulkInspectionForm orderId={o.id} criteria={criteria} lines={d.lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.id, label: `${productOf(l.offer_id)?.code ?? ""} · ${vlabel(l.variant_id)}`, qty: l.qty }))} />
      )}
      {inspection && (
        <section className="bg-surface p-4 text-body">
          <h2 className="font-semibold">{tk("admin.orders.inspection")} <span className="num ml-2 text-signature">{tk("admin.orders.matchRate", { n: inspection.info_match_rate ?? "-" })}</span></h2>
          <ul className="mt-2 divide-y divide-line">
            {inspection.results.map((r) => (
              <li key={r.field} className="flex justify-between py-1"><span>{r.field}</span><span className={r.match ? "text-signature" : "text-warn"}>{r.match ? "✓" : `✗ ${r.actual}`}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-surface p-4">
        <h2 className="text-meta font-semibold text-ink-2">{inv ? tk("order.invoice.fixed") : tk("admin.orders.preview")}</h2>
        <dl className="num mt-2 grid max-w-sm grid-cols-[1fr_auto] gap-y-1 text-body">
          <dt className="text-ink-2">{tk("order.invoice.subtotal")}</dt><dd>₩{krw(shown.subtotal_krw)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.fee")}</dt><dd>₩{krw(shown.fee_krw)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.options")}</dt><dd>₩{krw(shown.options_krw)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.logistics")}</dt><dd>{shown.logistics_final_krw != null ? `₩${krw(shown.logistics_final_krw)}` : "—"}</dd>
          <dt className="text-ink-2">{tk("order.invoice.sampleLogistics")}</dt><dd>₩{krw(shown.sample_logistics_krw ?? 0)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.sampleDeduction")}</dt><dd>−₩{krw(shown.sample_deduction_krw)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.deposit")}</dt><dd>−₩{krw(shown.deposit_paid_krw)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.credit")}</dt><dd>−₩{krw(shown.credit_krw)}{!inv && brand?.credit_balance_krw ? ` (${tk("admin.orders.creditBalance", { n: krw(brand.credit_balance_krw) })})` : ""}</dd>
          <dt className="border-t border-ink pt-1 font-semibold">{tk("order.invoice.total")}</dt><dd className="border-t border-ink pt-1 font-semibold">₩{krw(shown.total_krw)}</dd>
        </dl>
      </section>

      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("admin.orders.audit")}</h2>
        <ul className="num mt-2 space-y-1 text-meta text-ink-2">
          {d.logs.map((l, i) => <li key={i}>{fmtDate(l.created_at, "ko", true)} · {l.action} · {JSON.stringify(l.diff)}</li>)}
        </ul>
      </section>
      <CommentThread targetType="order" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={await adminThread("order", id, me.id)} />
    </div>
  );
}
