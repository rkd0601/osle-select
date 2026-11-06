import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandOrder } from "@/lib/db/brand/orders";
import { isReorder } from "@/lib/db/brand/billing";
import { getBankAccount } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { Timeline } from "@/components/domain/timeline";
import { NowBlock } from "@/components/domain/todo-row";
import { InvoiceSheet } from "@/components/domain/invoice-sheet";
import { ShipToLine } from "@/components/domain/ship-to-line";
import { getBrandAddress } from "@/lib/db/brand/samples";
import { GridCols } from "@/components/domain/grid-cols";
import { handoffFor } from "@/lib/handoff";
import { oneLine, orderIsMine, orderStateKey } from "@/lib/brand-state";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { transitionEvents } from "@/lib/timeline";
import { PaymentNoticeCard } from "@/components/domain/payment-notice-card";
import { fmtDay, krw } from "@/lib/format";
import { finalInvoiceParts, latestFinalApproval, loadOrderForCalc } from "@/lib/db/admin/orders";
import { finalApprovalState } from "@/lib/orders";
import { tk } from "@/lib/i18n";
import { BackLink } from "../../_ui/list";
import { ApproveFinalQuote, BackorderChoice, OrderHeaderActions, QtyConfirmForm, ReportDeposit, ReportForm, type QtyOffer } from "./order-controls";
import { bySortOrder } from "@/lib/images/order";

type Invoice = {
  groups: { offerId: string; qty: number; product_price_krw: number; unit_supply_krw: number; subtotal_krw: number; fee_krw: number }[];
  subtotal_krw: number; fee_krw: number; options_krw: number; sample_logistics_krw?: number; sample_deduction_krw: number; deposit_paid_krw: number; credit_krw: number; logistics_final_krw: number | null; total_krw: number; refund_due_krw?: number;
};

/**
 * B-08 발주서 상세 · B-09 진행·도착 검수 보고 (디자인 v2.2 "발주 상세"). 체인: 재고 확인 → (선금 → 홀딩) → 범위 견적 → 수량 확정 → 최종 견적 → 확정 → 출고 → 검품 → 발송 → 검수 보고.
 * 12칸: 왼쪽 8 — 메타 13("발주 · 11월 4일 · 리오더") · 제목 28 `{상품명} {수량}장` → 지금 상태 블록(`.nowblock`, 행동 버튼 포함) → 일정 3칸
 * → 옵션 표(옵션 · 주문 · 확보 · 확정) + 부족 한 문장 → "지금까지" | "위아더에게". 오른쪽 4 — "청구 금액" 청구표(사람 말 항목).
 * 눈썹 대문자·#id·핸드오프 카드·상태 점·상품 코드 없음(d-11). 금액은 확정 전엔 미리보기, 확정 뒤엔 고정된 청구 내역(invoice_snapshot). 결제는 플랫폼 밖(입금 신고까지).
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

  const variantLabel = (variantId: string) => {
    const v = data.variants.find((x) => x.id === variantId);
    const c = v && data.colors.find((x) => x.id === v.color_id);
    const s = v && data.sizes.find((x) => x.id === v.size_id);
    return [c?.name_ko, s?.label].filter(Boolean).join(" / ");
  };
  const productOf = (offerId: string) => data.products.find((p) => p.id === data.offers.find((x) => x.id === offerId)?.product_id);
  const offerIds = [...new Set(lines.map((l) => l.offer_id))];
  const products = offerIds.map(productOf).filter((p, i, xs) => p && xs.findIndex((x) => x?.id === p.id) === i) as NonNullable<ReturnType<typeof productOf>>[];
  const multi = products.length > 1;
  // 옵션 이름: 상품이 하나면 컬러 / 사이즈만, 여럿이면 상품명을 앞에
  const optionLabel = (l: { offer_id: string; variant_id: string }) => (multi ? `${productOf(l.offer_id)?.name_ko ?? ""} · ${variantLabel(l.variant_id)}` : variantLabel(l.variant_id));
  const nameByCode = new Map(data.products.map((p) => [p.code as string, p.name_ko as string | null]));

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
      offerId: oid, code: null, name: p?.name_ko ?? null, minQty: p?.min_qty ?? null, labels,
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
  const afterConfirm = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"].includes(o.status);
  // 대표 사진 = CN 편집 화면 1번(sort_order, 동순위 id) — 3차 검증 T4
  const covers = data.images.filter((i) => i.product_id === products[0]?.id).sort(bySortOrder);
  const coverPath = covers[0]?.storage_path ?? null;
  const [urls, reorder] = await Promise.all([
    signedReadUrls("productImages", coverPath ? [coverPath] : []),
    isReorder(brand.id, o.id, o.created_at, products.map((p) => p.id)),
  ]);

  // 지금 상태: 사람 말 한 문장 + (템플릿이 있으면) 다음 행동 한 문장 + 기한
  const reported = !!o.deposit_reported_at && !o.deposit_confirmed_at;
  const h = handoffFor("order", o.status, { depositReported: reported, finalApproved: approved });
  const mine = orderIsMine(o, approved);
  const dueAt = o.status === "delivered" ? o.report_due : o.due_at;
  const nowSub = o.status === "cancelled" || o.status === "report_done" ? null : oneLine([
    h ? tk(h.decide) : null,
    dueAt ? tk(mine ? "state.until" : "state.on", { date: fmtDay(dueAt) }) : null,
  ]);
  const canCancel = next.includes("cancelled") && ((!o.deposit_confirmed_at && !o.deposit_reported_at) || user.role === "ADMIN");
  const canReceive = o.status === "sent_to_brand";
  const short = lines.filter((l) => l.stock_result === "short");

  // 청구표: 항목 이름은 사람 말(상품 n장 · 소싱 서비스 n% · 물류 · 낸 선금 · 청구)
  const rates = [...new Set(data.offers.map((x) => Number(x.fee_rate ?? 0)))];
  const invRows = shownInv ? [
    { label: tk("order.invoice.products", { n: totalQty }), value: shownInv.subtotal_krw },
    { label: rates.length === 1 ? tk("order.invoice.feeRate", { p: Math.round(rates[0] * 100) }) : tk("order.invoice.feeShort"), value: shownInv.fee_krw },
    { label: tk("order.invoice.options"), value: shownInv.options_krw, hidden: !(shownInv.options_krw > 0) },
    { label: tk("order.invoice.logisticsShort"), value: shownInv.logistics_final_krw ?? 0, hidden: shownInv.logistics_final_krw == null },
    { label: tk("order.invoice.sampleLogistics"), value: shownInv.sample_logistics_krw ?? 0, hidden: !((shownInv.sample_logistics_krw ?? 0) > 0) },
    { label: tk("order.invoice.sampleDeduction"), value: shownInv.sample_deduction_krw, minus: true, hidden: !(shownInv.sample_deduction_krw > 0) },
    { label: tk("order.invoice.depositPaid"), value: shownInv.deposit_paid_krw, minus: true, hidden: !(shownInv.deposit_paid_krw > 0) },
    { label: tk("order.invoice.credit"), value: shownInv.credit_krw, minus: true, hidden: !(shownInv.credit_krw > 0) },
  ] : [];
  const refund = shownInv?.refund_due_krw ?? 0;
  const invExtra = refund > 0 || (preview && !approved) ? (
    <>
      {refund > 0 && <p className="num text-meta text-ink-2">{tk("order.invoice.refundDue")} ₩{krw(refund)}</p>}
      {preview && !approved && (actor.canPurchase ? (
        <div id="approve" className={refund > 0 ? "mt-4" : undefined}>
          <ApproveFinalQuote brandId={brand.id} orderId={o.id} total={preview.total_krw} />
          <p className="mt-2 text-caption text-muted">{tk("order.approve.help")}</p>
        </div>
      ) : (
        <p className="text-meta text-warn">{tk("order.approve.noPurchase")}</p>
      ))}
    </>
  ) : undefined;

  const name = products[0]?.name_ko ?? tk("billing.orders");

  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8 min-w-0">
        <p className="meta">{tk("order.detail.meta", { date: fmtDay(o.created_at) })}{reorder ? ` · ${tk("billing.reorder")}` : ""}</p>
        <h1 className="h1 mt-3">
          {name}
          {products.length > 1 && <span className="dim"> {tk("detail.more", { n: products.length - 1 })}</span>}
          {" "}<span className="num thin">{tk("detail.qty", { n: totalQty })}</span>
        </h1>
      </div>
      <div className="c4" />
      {/* 상세 머리 → 12칸 잉크 룰 한 줄 → 왼쪽 8 / 오른쪽 4가 같은 y에서 시작(v2.6 R1) */}
      <div className="c12 rule-ink" />
      <div className="c8 min-w-0">
        <NowBlock photo={coverPath ? urls[coverPath] ?? null : null} title={tk(orderStateKey(o, { finalApproved: approved }))} sub={nowSub}>
          {canCancel || canReceive ? <OrderHeaderActions brandId={brand.id} orderId={o.id} canCancel={canCancel} canReceive={canReceive} /> : null}
        </NowBlock>
        {warn === "schedule" && <p className="mt-4 text-meta text-warn">{tk("order.warn.schedule")}</p>}

        {o.status === "deposit_pending" && o.deposit_krw != null && (
          <div id="deposit" className="mt-8">
            <PaymentNoticeCard kind="deposit" amount={o.deposit_krw} bank={bank} due={o.due_at} reportedAt={o.deposit_reported_at} confirmedAt={o.deposit_confirmed_at}>
              <ReportDeposit brandId={brand.id} orderId={o.id} />
            </PaymentNoticeCard>
          </div>
        )}

        <dl className="kv mt-8" style={{ borderTop: 0, paddingTop: 0 }}>
          <div><dt className="label">{tk("order.field.gbOpen")}</dt><dd className="v">{fmtDay(o.gb_open_date) || "-"}</dd></div>
          <div><dt className="label">{tk("order.field.gbClose")}</dt><dd className="v">{fmtDay(o.gb_close_date) || "-"}</dd></div>
          <div><dt className="label">{tk("order.field.deliveryPromise")}</dt><dd className="v">{fmtDay(o.delivery_promise_date) || "-"}</dd></div>
        </dl>

        {range && o.status === "quoted" && (
          <section className="mt-8">
            <div className="label">{tk("order.detail.rangeQuote")}</div>
            <p className="num mt-3 text-h1 font-light tracking-[-0.03em]">₩{krw(range.min_krw)} – ₩{krw(range.max_krw)}</p>
            <p className="mt-2 text-meta text-ink-2">{tk("order.detail.rangeHelp")}</p>
            {o.quote_note && <p className="mt-1 text-meta text-ink-2">{o.quote_note}</p>}
          </section>
        )}
        {o.status === "quoted" && (
          <div id="qty" className="mt-8">
            <QtyConfirmForm brandId={brand.id} orderId={o.id} offers={qtyOffers} canPurchase={actor.canPurchase} defaultRoute={o.route as "inspect" | "direct"} />
          </div>
        )}

        {o.status !== "quoted" && (
          <section className="mt-8">
            <div className="max-w-full overflow-x-auto">
              <table className="tbl gridt">
                <GridCols spans={[5, 1, 1, 1]} />
                <thead>
                  <tr><th>{tk("order.detail.col.option")}</th><th className="r">{tk("order.detail.col.ordered")}</th><th className="r">{tk("order.detail.secured")}</th><th className="r">{tk("order.detail.qty")}</th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="ell pr-4">{optionLabel(l)}</td>
                      <td className="r text-ink-2">{l.expected_qty}</td>
                      <td className={`r ${l.stock_result === "short" ? "short" : ""}`}>{l.stock_result === "pending" ? "-" : l.confirmed_qty ?? "-"}</td>
                      <td className="r strong">{l.qty || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {short.length > 0 && (
              <p className="mt-3 text-meta text-warn">{tk("order.detail.partialStock", { items: short.map((l) => tk("order.detail.shortItem", { v: optionLabel(l), n: l.confirmed_qty ?? 0 })).join(", ") })}</p>
            )}
          </section>
        )}

        {backorders.length > 0 && (
          <section className="mt-14">
            <div className="section-h"><h2>{tk("order.detail.backorders")}<span className="count">{backorders.length}</span></h2></div>
            {backorders.map((l) => {
              const log = (l.backorder_log ?? []) as { at: string; note?: string; eta?: string | null; qty?: number; by?: string; choice?: string }[];
              const last = log.filter((x) => x.by !== "brand").at(-1);
              const choice = log.filter((x) => x.by === "brand").at(-1)?.choice ?? null;
              const days = l.backorder_eta ? Math.max(0, Math.ceil((new Date(`${l.backorder_eta}T00:00:00+09:00`).getTime() - Date.now()) / 86400000)) : null;
              return (
                <div key={l.id} className="border-b border-line py-4 text-body">
                  <p className="num">
                    <span className="font-medium">{optionLabel(l)}</span>{" "}
                    {l.backorder_status === "resolved" ? tk("order.backorder.resolved") : tk("order.backorder.line", { n: l.backorder_qty, date: fmtDay(l.backorder_eta) })}
                    {days != null && l.backorder_status === "backordered" && <span className="ml-1 text-warn">{tk("order.backorder.days", { n: days })}</span>}
                  </p>
                  {last?.note && <p className="num mt-1 text-meta text-ink-2">{fmtDay(last.at)} · {last.note}</p>}
                  {l.backorder_status === "backordered" && <BackorderChoice brandId={brand.id} lineId={l.id} current={choice} />}
                </div>
              );
            })}
          </section>
        )}

        {data.inspection && (
          <section className="mt-14">
            <div className="section-h"><h2>{tk("order.report.title")}<span className="count">{tk("order.report.meta", { date: fmtDay(data.inspection.inspected_at), n: data.inspection.defect_qty })}</span></h2></div>
            <p className="num mt-4 text-display font-light tracking-[-0.02em]">{data.inspection.info_match_rate != null ? tk("order.report.rate", { n: Number(data.inspection.info_match_rate) }) : "-"}</p>
            <table className="tbl mt-4">
              <tbody>
                {((data.inspection.results ?? []) as { field: string; expected: string; actual: string; match: boolean }[]).map((r) => {
                  const [code, f] = r.field.includes(":") ? r.field.split(":") : ["", r.field];
                  const pname = code && multi ? nameByCode.get(code) : null;
                  return (
                    <tr key={r.field}>
                      <td className="pr-4">{pname && <span className="block text-meta text-ink-2">{pname}</span>}{tk(`order.report.field.${f}`)} · <span className="text-ink-2">{r.expected}</span>{!r.match && r.actual && <span className="text-warn"> · {r.actual}</span>}</td>
                      <td className={`r ${r.match ? "text-ink-2" : "short strong"}`}>{tk(r.match ? "inspect.match" : "inspect.mismatch")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        {o.kr_tracking && <p className="num mt-4 text-meta text-ink-2">{tk("order.detail.tracking", { t: o.kr_tracking })}</p>}
        {o.status === "delivered" && (
          <div id="report" className="mt-14">
            <ReportForm brandId={brand.id} orderId={o.id} due={o.report_due ? tk("state.until", { date: fmtDay(o.report_due) }) : null}
              lines={lines.filter((l) => l.qty > 0).map((l) => ({ lineId: l.id, label: optionLabel(l), qty: l.qty }))} />
          </div>
        )}
        {o.status === "report_done" && (
          <section className="mt-14">
            <div className="section-h"><h2>{tk("order.detail.reportDone")}</h2></div>
            <p className="num mt-4 text-body">{tk("order.detail.defects", { n: lines.reduce((s, l) => s + l.defect_qty, 0) })}</p>
            <p className="num mt-1 text-meta text-ink-2">{o.credit_issued_krw > 0 ? tk("order.detail.credit", { n: krw(o.credit_issued_krw) }) : tk("order.detail.creditPending")}</p>
          </section>
        )}

        <div className="two half mt-14">
          <section>
            <div className="section-h" style={{ borderBottom: 0, paddingBottom: 12 }}><h2>{tk("detail.sofar")}</h2></div>
            <Timeline day rows={events.some((e) => e.kind === "transition")
              ? events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: tk(`status.order.${e.to}`) }))
              : steps.map(([k, at]) => ({ at, label: tk(`order.step.${k}`) }))} />
          </section>
          <CommentThread targetType="order" targetId={id} viewer="brand" tabs={["brand"]} rows={comments} title={tk("detail.toWeare")} />
        </div>
      </div>

      <aside className="c4 min-w-0">
        <InvoiceSheet
          label={tk("order.invoice.title")}
          total={shownInv?.total_krw ?? null}
          rows={invRows}
          sumLabel={tk("order.invoice.sum")}
          empty={o.logistics_quote_final_krw != null ? <span className="num">{tk("order.invoice.logisticsFinal", { n: krw(o.logistics_quote_final_krw) })}</span> : tk("order.invoice.pendingHelp")}
          note={approved ? tk("order.approve.done", { date: fmtDay(approval!.at) }) : null}
          help={inv ? (o.confirmed_at ? tk("order.invoice.fixedHelp", { date: fmtDay(o.confirmed_at) }) : tk("order.invoice.offPlatform")) : preview && !approved ? tk("order.invoice.previewHelp") : tk("order.invoice.offPlatform")}
        >
          {invExtra}
        </InvoiceSheet>
        {afterConfirm && <p className="mt-4"><Link href={`/b/${slug}/billing#packages`} className="link">{tk("order.toPackages")}</Link></p>}
        <ShipToLine className="mt-10" address={(await getBrandAddress(brand.id)).address} settingsHref={`/b/${slug}/settings#address`} />
      </aside>
    </div>
  );
}
