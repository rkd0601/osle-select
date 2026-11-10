"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { VariantMatrix } from "@/components/domain/variant-matrix";
import { approveFinalQuote, cancelOrder, chooseBackorder, confirmOrderQuantities, markOrderDelivered, previewOrder, reportDeposit, submitOrderReport } from "../actions";

type R = { ok: true } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<R>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) return setMsg(tk(r.error));
      router.refresh();
    });
  return { pending, msg, run };
}
const btn = "btn";

export function OrderHeaderActions({ brandId, orderId, canCancel, canReceive }: { brandId: string; orderId: string; canCancel: boolean; canReceive: boolean }) {
  const { pending, msg, run } = useRun();
  if (!canCancel && !canReceive) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {canReceive && <button className={`${btn} max-sm:w-full`} disabled={pending} onClick={() => run(() => markOrderDelivered(brandId, orderId))}>{tk("order.received")}</button>}
      {canCancel && (
        <button className="min-h-11 text-meta text-ink-2 hover:text-crit" disabled={pending}
          onClick={() => window.confirm(tk("order.cancelConfirm")) && run(() => cancelOrder(brandId, orderId))}>{tk("order.cancel")}</button>
      )}
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

/** 선금 "입금 신고" — 확인은 관리자 */
export function ReportDeposit({ brandId, orderId }: { brandId: string; orderId: string }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useRun();
  return (
    // 8칸 소그리드: 입력 6칸 · 버튼 2칸(사이 24) — 샘플 입금 신고와 같은 모양(S1)
    <div className="grid grid-cols-8 items-end gap-x-6 gap-y-3">
      <input aria-label={tk("payment.notice.notePh")} className="field col-span-8 min-w-0 sm:col-span-6" placeholder={tk("payment.notice.notePh")} maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={`${btn} col-span-8 w-full sm:col-span-2`} disabled={pending} onClick={() => run(() => reportDeposit(brandId, orderId, note))}>{tk("payment.notice.report")}</button>
      {msg && <span className="col-span-8 text-meta text-crit">{msg}</span>}
    </div>
  );
}

/** 최종 견적 동의 (u-10) — 금액은 서버가 다시 계산해 기록한다 */
export function ApproveFinalQuote({ brandId, orderId, total }: { brandId: string; orderId: string; total: number }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-2">
      <button className="btn lg w-full" disabled={pending}
        onClick={() => window.confirm(tk("order.approve.ask", { n: krw(total) })) && run(() => approveFinalQuote(brandId, orderId))}>
        {tk("order.approve.cta", { n: krw(total) })}
      </button>
      {msg && <p className="text-meta text-crit">{msg}</p>}
    </div>
  );
}

export type QtyOffer = {
  offerId: string; code: string | null; name: string | null; minQty: number | null;
  labels: { type: string; moq: number; unit_price_krw: number }[];
  colors: { id: string; name: string; hex: string | null }[]; sizes: { id: string; label: string }[];
  cells: { lineId: string; variantId: string; colorId: string; sizeId: string; max: number; initial: number }[];
};
type Preview = { subtotal_krw: number; fee_krw: number; options_krw: number; sample_logistics_krw: number; sample_deduction_krw: number; deposit_paid_krw: number; total_krw: number };

/**
 * B-08 2단계 수량 확정: 확보 수량 이내(칸마다 max) · 최소 수량 · 라벨 MOQ · 경로(검품 경유/직송, `.choice`). 금액은 서버 미리보기(같은 함수로 확정).
 * 최종 물류비는 위아더 최종 견적에서 더해진다. 디자인 v2: 상자 없이 룰 사이, 입력은 밑줄.
 */
export function QtyConfirmForm({ brandId, orderId, offers, canPurchase, defaultRoute }: { brandId: string; orderId: string; offers: QtyOffer[]; canPurchase: boolean; defaultRoute: "inspect" | "direct" }) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(offers.flatMap((o) => o.cells.map((c) => [c.variantId, c.initial]))));
  const [labels, setLabels] = useState<Record<string, number>>({});
  const [route, setRoute] = useState(defaultRoute);
  const [preview, setPreview] = useState<Preview | null>(null);
  const { pending, msg, run } = useRun();
  const input = useMemo(() => ({
    lines: offers.flatMap((o) => o.cells.map((c) => ({ lineId: c.lineId, qty: qty[c.variantId] ?? 0 }))),
    labels: offers.flatMap((o) => o.labels.map((l) => ({ offerId: o.offerId, type: l.type, qty: labels[`${o.offerId}:${l.type}`] ?? 0 }))),
    route,
  }), [offers, qty, labels, route]);
  useEffect(() => {
    const t = setTimeout(() => {
      previewOrder(brandId, orderId, input).then((r) => setPreview(r.ok ? r.data : null)).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [brandId, orderId, input]);
  const offerQty = (o: QtyOffer) => o.cells.reduce((n, c) => n + (qty[c.variantId] ?? 0), 0);
  const blocked = offers.some((o) => o.minQty != null && offerQty(o) > 0 && offerQty(o) < o.minQty)
    || offers.some((o) => o.labels.some((l) => { const n = labels[`${o.offerId}:${l.type}`] ?? 0; return n > 0 && n < l.moq; }));

  return (
    <section className="space-y-8">
      <div>
        <div className="section-h"><h2>{tk("order.confirm.title")}</h2></div>
        <p className="mt-3 text-meta text-ink-2">{tk("order.confirm.lead")}</p>
      </div>
      {offers.map((o) => (
        <div key={o.offerId} className="space-y-3">
          <p className="text-lead font-medium">{o.name}</p>
          <VariantMatrix
            colors={o.colors} sizes={o.sizes} max={100_000} totalLabel={tk("sample.new.total")}
            cells={o.cells.map((c) => ({ variantId: c.variantId, colorId: c.colorId, sizeId: c.sizeId, max: c.max }))}
            value={qty} onChange={setQty}
          />
          <p className="text-caption text-muted">{tk("order.confirm.maxHelp")}</p>
          {o.minQty != null && offerQty(o) > 0 && offerQty(o) < o.minQty && <p className="num text-caption text-warn">{tk("order.new.belowMin", { n: o.minQty })}</p>}
          {o.labels.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className="label">{tk("order.confirm.labels")}</p>
              {o.labels.map((l) => {
                const k = `${o.offerId}:${l.type}`;
                const n = labels[k] ?? 0;
                return (
                  <label key={l.type} className="num flex items-end gap-3 text-meta">
                    <span className="w-24 pb-3">{tk(`product.option.labelType.${l.type}`)}</span>
                    <input type="number" inputMode="numeric" min={0} className={`field w-20 text-center ${n > 0 && n < l.moq ? "border-b-warn" : ""}`} value={n}
                      onChange={(e) => setLabels({ ...labels, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                    <span className="pb-3 text-muted">{tk("order.confirm.labelPrice", { n: krw(l.unit_price_krw), moq: l.moq })}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <fieldset>
        <legend className="label mb-3">{tk("order.confirm.route")}</legend>
        <div className="choice">
          {(["inspect", "direct"] as const).map((r) => (
            <label key={r} className={route === r ? "on" : undefined}>
              <input type="radio" name="route" className="sr-only" checked={route === r} onChange={() => setRoute(r)} />
              <span aria-hidden className="radio" />
              <span><span className="t block">{tk(`order.route.${r}`)}</span><span className="d block">{tk(`order.route.${r}Help`)}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="border-t border-line pt-4">
        <dl className="num grid grid-cols-[1fr_auto] gap-y-2 text-body">
          <dt className="text-ink-2">{tk("order.invoice.subtotal")}</dt><dd>₩{krw(preview?.subtotal_krw ?? 0)}</dd>
          <dt className="text-ink-2">{tk("order.invoice.fee")}</dt><dd>₩{krw(preview?.fee_krw ?? 0)}</dd>
          {(preview?.options_krw ?? 0) > 0 && <><dt className="text-ink-2">{tk("order.invoice.options")}</dt><dd>₩{krw(preview!.options_krw)}</dd></>}
          {(preview?.sample_logistics_krw ?? 0) > 0 && <><dt className="text-ink-2">{tk("order.invoice.sampleLogistics")}</dt><dd>₩{krw(preview!.sample_logistics_krw)}</dd></>}
          {(preview?.sample_deduction_krw ?? 0) > 0 && <><dt className="text-ink-2">{tk("order.invoice.sampleDeduction")}</dt><dd>−₩{krw(preview!.sample_deduction_krw)}</dd></>}
          {(preview?.deposit_paid_krw ?? 0) > 0 && <><dt className="text-ink-2">{tk("order.invoice.deposit")}</dt><dd>−₩{krw(preview!.deposit_paid_krw)}</dd></>}
          <dt className="mt-2 border-t border-line-strong pt-3 font-medium">{tk("order.confirm.beforeLogistics")}</dt>
          <dd className="mt-2 border-t border-line-strong pt-3 text-h2 font-light">₩{krw(preview?.total_krw ?? 0)}</dd>
        </dl>
      </div>
      {!canPurchase && <p className="text-meta text-warn">{tk("sample.error.noPurchase")}</p>}
      {msg && <p className="text-meta text-crit">{msg}</p>}
      <button className="btn lg w-full" disabled={pending || !canPurchase || blocked} onClick={() => run(() => confirmOrderQuantities(brandId, orderId, input))}>
        {pending ? tk("common.saving") : tk("order.confirm.submit")}
      </button>
    </section>
  );
}

/** B-09 도착 검수 보고: 라인별 불량 수량 + 메모. 크레딧은 위아더가 확인 후 확정 */
export function ReportForm({ brandId, orderId, lines, due }: { brandId: string; orderId: string; lines: { lineId: string; label: string; qty: number }[]; due?: string | null }) {
  const [defects, setDefects] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <section className="space-y-4">
      <div className="section-h"><h2>{tk("order.report.mineTitle")}</h2>{due && <span className="num meta">{due}</span>}</div>
      <p className="text-meta text-ink-2">{tk("order.report.lead")}</p>
      <ul className="border-t border-line">
        {lines.map((l) => (
          <li key={l.lineId} className="num flex items-end justify-between gap-4 border-b border-line py-2 text-body">
            <span className="pb-3">{l.label} <span className="text-muted">×{l.qty}</span></span>
            <label className="flex items-end gap-3 text-meta text-ink-2"><span className="pb-3">{tk("order.report.defect")}</span>
              <input type="number" inputMode="numeric" min={0} max={l.qty} className="field w-16 text-center" value={defects[l.lineId] ?? 0}
                onChange={(e) => setDefects({ ...defects, [l.lineId]: Math.max(0, Math.min(l.qty, Math.floor(Number(e.target.value) || 0))) })} />
            </label>
          </li>
        ))}
      </ul>
      <textarea aria-label={tk("order.report.notePh")} className="field" rows={3} maxLength={1000} placeholder={tk("order.report.notePh")} value={note} onChange={(e) => setNote(e.target.value)} />
      {msg && <p className="text-meta text-crit">{msg}</p>}
      <button className={`${btn} max-sm:w-full`} disabled={pending} onClick={() => run(() => submitOrderReport(brandId, orderId, { lines: lines.map((l) => ({ lineId: l.lineId, defectQty: defects[l.lineId] ?? 0 })), note }))}>
        {tk("order.report.submit")}
      </button>
    </section>
  );
}

/** 미송 라인 선택지: 대체 / 기다리기 / 취소 (원청 대응은 위아더) */
export function BackorderChoice({ brandId, lineId, current }: { brandId: string; lineId: string; current: string | null }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {(["substitute", "wait", "cancel"] as const).map((c) => (
        <button key={c} disabled={pending} onClick={() => run(() => chooseBackorder(brandId, lineId, c))}
          className="chip" aria-pressed={current === c}>{tk(`order.backorder.choice.${c}`)}</button>
      ))}
      {msg && <span className="text-caption text-crit">{msg}</span>}
    </div>
  );
}
