import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrderForAdmin, latestFinalApproval } from "@/lib/db/admin/orders";
import { bulkCriteria, creditAmount, finalApprovalState, orderDeposit, orderInvoice, orderOptionLines } from "@/lib/orders";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { BackLink, DetailLayout, Facts, Section } from "../../_ui/ui";
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
  // 최종 견적 브랜드 동의 (u-10) — 확정 버튼은 동의가 유효할 때만, 서버(confirmOrder)도 같은 판정
  const approvalRow = o.status === "final_quoted" ? await latestFinalApproval(o.id) : null;
  const approval = o.status === "final_quoted"
    ? { state: finalApprovalState(approvalRow, o.final_quoted_at, preview.total_krw), at: approvalRow?.at ?? null, total: approvalRow?.total_krw ?? null, onBehalf: approvalRow?.onBehalf ?? false }
    : null;
  const depositSuggest = o.deposit_pct ? orderDeposit(d.groups.map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, qty: d.lines.find((x) => x.id === l.lineId)?.confirmed_qty ?? l.qty })) })), Number(o.deposit_pct)) : null;
  const criteria = d.products.flatMap((p) => bulkCriteria(
    { fabric: p.fabric as { material_code: string; pct: number }[] | null, origin: p.origin, care_codes: p.care_codes },
    d.colors.filter((c) => c.product_id === p.id).map((c) => c.name_ko ?? ""), // 결과는 브랜드 리포트로 나간다 — _zh 금지(규칙 1)
    d.sizes.filter((s) => s.product_id === p.id).map((s) => s.label),
  ).map((c) => ({ ...c, field: `${p.code}:${c.field}` })));
  const range = (o.logistics_quote_range ?? null) as { min_krw: number; max_krw: number } | null;
  const mods = (o.mod_requests ?? []) as { offerId: string; item: string; note?: string }[];
  const inspection = d.inspection as { results: { field: string; expected: string; actual: string; match: boolean }[]; info_match_rate: number | null; defect_qty: number } | null;

  const thread = await adminThread("order", id, me.id);
  const totalQty = d.lines.reduce((n, l) => n + (l.qty || l.expected_qty), 0);
  const money: [string, string, boolean?][] = [
    [tk("order.invoice.subtotal"), `₩${krw(shown.subtotal_krw)}`],
    [tk("order.invoice.fee"), `₩${krw(shown.fee_krw)}`],
    [tk("order.invoice.options"), `₩${krw(shown.options_krw)}`],
    [tk("order.invoice.logistics"), shown.logistics_final_krw != null ? `₩${krw(shown.logistics_final_krw)}` : "—"],
    [tk("order.invoice.sampleLogistics"), `₩${krw(shown.sample_logistics_krw ?? 0)}`],
    [tk("order.invoice.sampleDeduction"), `−₩${krw(shown.sample_deduction_krw)}`, true],
    [tk("order.invoice.deposit"), `−₩${krw(shown.deposit_paid_krw)}`, true],
    [tk("order.invoice.credit"), `−₩${krw(shown.credit_krw)}`, true],
  ];

  return (
    <div>
      <BackLink href="/admin/orders" />
      <PageHeader eyebrow={tk("entity.order")} title={`${brand?.name ?? ""} · ${fmtDate(o.created_at)}`}
        actions={<Link href={`/b/${brand?.slug}/orders/${o.id}`} className="btn btn-secondary btn-sm">{tk("admin.orders.asBrand")} ↗</Link>}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill entity="order" status={o.status} />
          {o.admin_waived && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">{tk("admin.orders.waived")}</span>}
          <span className="num text-meta text-ink-2">{tk("order.list.qty", { n: totalQty })}</span>
        </div>
      </PageHeader>
      <DetailLayout
        asideWidth="360px"
        main={
          <>
            <Section title={tk("admin.orders.terms")}>
              <Facts cols={2} rows={[
                [tk("order.field.gbClose"), <span key="g" className="num">{fmtDate(o.gb_close_date)}</span>],
                [tk("order.field.deliveryPromise"), <span key="d" className="num">{fmtDate(o.delivery_promise_date)}</span>],
                [tk("admin.orders.holdLabel"), o.hold_choice === "deposit" ? tk("order.detail.holdDeposit", { p: Math.round(Number(o.deposit_pct ?? 0) * 100) }) : tk("order.detail.holdNone")],
                [tk("admin.orders.routeLabel"), tk(`order.route.${o.route}`)],
                ...(o.deposit_note ? [[tk("admin.orders.depositNoteLabel"), o.deposit_note] as [string, React.ReactNode]] : []),
                ...(range ? [[tk("admin.orders.rangeLabel"), <span key="r" className="num">₩{krw(range.min_krw)} – ₩{krw(range.max_krw)}</span>] as [string, React.ReactNode]] : []),
              ]} />
              {mods.length > 0 && (
                <p className="mt-3 text-meta text-ink-2"><span className="font-semibold text-ink">{tk("order.new.mods")}</span> · {mods.map((m) => `${productOf(m.offerId)?.code ?? ""} ${tk(`product.option.mod.${m.item}`)}${m.note ? ` (${m.note})` : ""}`).join(" · ")}</p>
              )}
            </Section>

            <Section title={tk("order.detail.lines")} count={d.lines.length} flush>
              <table className="table-ui num">
                <thead>
                  <tr>
                    <th>{tk("order.detail.item")}</th>
                    <th className="text-right">{tk("order.detail.expected")}</th>
                    <th className="text-right">{tk("order.detail.secured")}</th>
                    <th className="text-right">{tk("order.detail.qty")}</th>
                    <th className="text-right">{tk("admin.orders.unit")}</th>
                    <th>{tk("admin.orders.cn")}</th>
                    <th><span className="sr-only">{tk("admin.orders.backorderAdd")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => {
                    const p = productOf(l.offer_id);
                    return (
                      <tr key={l.id} className={l.backorder_status === "backordered" ? "[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-warn)]" : ""}>
                        <td className="align-top font-sans"><span className="num text-caption text-muted">{p?.code}</span> <span className="font-medium">{p?.name_ko}</span><div className="text-caption text-ink-2">{vlabel(l.variant_id)}</div></td>
                        <td className="text-right align-top">{l.expected_qty}</td>
                        <td className={`text-right align-top ${l.stock_result === "short" ? "font-semibold text-warn" : ""}`}>{l.stock_result === "pending" ? "—" : l.confirmed_qty}</td>
                        <td className="text-right align-top font-semibold">{l.qty || "—"}</td>
                        <td className="text-right align-top">{l.unit_price_krw != null ? `₩${krw(l.unit_price_krw)}` : ""}</td>
                        <td className="align-top font-sans text-caption text-ink-2">{(() => { const c = ((l.backorder_log ?? []) as { by?: string; choice?: string }[]).filter((x) => x.by === "brand").at(-1)?.choice; return c ? `${tk(`order.backorder.choice.${c}`)} · ` : ""; })()}{l.cn_note}{l.cn_shipped_at ? ` · ${tk("admin.orders.shipped", { t: l.cn_tracking ?? "" })}` : ""}</td>
                        <td className="align-top">{["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"].includes(o.status) && <BackorderEditor lineId={l.id} status={l.backorder_status} qty={l.backorder_qty} eta={l.backorder_eta} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>

            {o.status === "kr_inspecting" && !o.inspection_id && (
              <BulkInspectionForm orderId={o.id} criteria={criteria} lines={d.lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.id, label: `${productOf(l.offer_id)?.code ?? ""} · ${vlabel(l.variant_id)}`, qty: l.qty }))} />
            )}
            {inspection && (
              <Section title={tk("admin.orders.inspection")} actions={<span className="num text-body font-semibold text-signature">{tk("admin.orders.matchRate", { n: inspection.info_match_rate ?? "-" })}</span>}>
                <ul className="divide-y divide-line text-body">
                  {inspection.results.map((r) => (
                    <li key={r.field} className="flex justify-between gap-3 py-1.5"><span className="num text-meta text-ink-2">{r.field}</span><span className={r.match ? "text-signature" : "font-medium text-warn"}>{r.match ? "✓" : `✗ ${r.actual}`}</span></li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title={tk("comments.title")}><CommentThread targetType="order" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={thread} /></Section>

            <Section title={tk("admin.orders.audit")} count={d.logs.length}>
              {d.logs.length === 0 ? <p className="text-body text-ink-2">-</p> : (
                <ul className="num space-y-1.5 text-meta text-ink-2">
                  {d.logs.map((l, i) => (
                    <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                      <span className="text-muted">{fmtDate(l.created_at, "ko", true)}</span>
                      <span className="min-w-0 break-all"><span className="font-semibold text-ink">{l.action}</span> · {JSON.stringify(l.diff)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        }
        aside={
          <>
            <OrderStepControls
              hasInvoice={!!o.invoice_snapshot}
              orderId={o.id} status={o.status} holdChoice={o.hold_choice} route={o.route} depositSuggest={depositSuggest} depositReported={!!o.deposit_reported_at}
              range={range} finalQuote={o.logistics_quote_final_krw} total={preview.total_krw} hasInspection={!!o.inspection_id}
              creditSuggest={creditAmount(d.lines)} creditIssued={o.credit_issued_krw} approval={approval}
            />
            <Section title={inv ? tk("order.invoice.fixed") : tk("admin.orders.preview")} tone={inv ? "brand" : undefined}>
              <div className="eyebrow">{tk("order.invoice.total")}</div>
              <div className="num mt-1 text-title font-semibold leading-none">₩{krw(shown.total_krw)}</div>
              <dl className="num mt-4 space-y-1.5 text-body">
                {money.map(([k, v, minus]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-meta text-ink-2">{k}</dt>
                    <dd className={minus ? "text-ink-2" : ""}>{v}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-ink pt-2 font-semibold">
                  <dt>{tk("order.invoice.total")}</dt><dd>₩{krw(shown.total_krw)}</dd>
                </div>
              </dl>
              {!inv && brand?.credit_balance_krw ? <p className="num mt-3 text-caption text-muted">{tk("admin.orders.creditBalance", { n: krw(brand.credit_balance_krw) })}</p> : null}
            </Section>
          </>
        }
      />
    </div>
  );
}
