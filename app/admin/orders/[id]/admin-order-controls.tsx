"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import {
  adminCancelOrder, confirmDeposit, confirmOrder, draftRangeQuote, issueOrderCredit, reaggregateStock, receiveOrder, recheckStock, requestDeposit,
  sendOrderToBrand, startQuote, startStockCheck, submitBulkInspection, submitFinalQuote, submitRangeQuote, updateBackorder,
} from "../actions";

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
  return { pending, msg, setMsg, run };
}
const btn = "bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40";
const num = "w-32 border border-line bg-surface px-2 py-1.5 text-[13px] num";

/** 체인 단계별 다음 행동 (전이는 서버가 다시 검사한다) */
export function OrderStepControls(p: {
  orderId: string; status: string; holdChoice: string; route: string; depositSuggest: number | null; depositReported: boolean;
  range: { min_krw: number; max_krw: number } | null; finalQuote: number | null; total: number; hasInspection: boolean; creditSuggest: number; creditIssued: number;
}) {
  const { pending, msg, setMsg, run } = useRun();
  const [min, setMin] = useState(p.range?.min_krw ?? 0);
  const [max, setMax] = useState(p.range?.max_krw ?? 0);
  const [note, setNote] = useState("");
  const [fin, setFin] = useState(p.finalQuote ?? Math.round(((p.range?.min_krw ?? 0) + (p.range?.max_krw ?? 0)) / 2));
  const [tracking, setTracking] = useState("");
  const [credit, setCredit] = useState(p.creditSuggest);
  const s = p.status;
  const draft = async () => {
    const r = await draftRangeQuote(p.orderId);
    if (!r.ok) return setMsg(tk(r.error));
    setMin(r.data.min);
    setMax(r.data.max);
  };
  // confirmed 전 모든 상태 (DECISIONS r5-12) — 선금 환불은 플랫폼 밖
  const cancellable = ["reserved", "stock_checking", "stock_short", "stock_confirmed", "partial_confirmed", "deposit_pending", "hold_confirmed", "quoting", "quoted", "qty_confirmed", "final_quoted"].includes(s);
  return (
    <section className="space-y-3 border-l-2 border-ink bg-surface px-4 py-3 text-[13px]">
      <h2 className="text-[12px] font-semibold text-ink-2">{tk(`admin.orders.next.${s}`)}</h2>
      {s === "reserved" && <button className={btn} disabled={pending} onClick={() => run(() => startStockCheck(p.orderId))}>{tk("admin.orders.startStock")}</button>}
      {s === "stock_checking" && <button className="border border-line px-3 py-1.5 text-[12px]" disabled={pending} onClick={() => run(() => reaggregateStock(p.orderId))}>{tk("admin.orders.reaggregate")}</button>}
      {s === "stock_short" && <button className={btn} disabled={pending} onClick={() => run(() => recheckStock(p.orderId))}>{tk("admin.orders.recheck")}</button>}
      {(s === "stock_confirmed" || s === "partial_confirmed") && (p.holdChoice === "deposit" ? (
        <button className={btn} disabled={pending} onClick={() => run(() => requestDeposit(p.orderId))}>{tk("admin.orders.requestDeposit", { n: krw(p.depositSuggest ?? 0) })}</button>
      ) : (
        <button className={btn} disabled={pending} onClick={() => run(() => startQuote(p.orderId))}>{tk("admin.orders.startQuote")}</button>
      ))}
      {s === "deposit_pending" && (
        <div className="flex items-center gap-3">
          <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.orders.confirmDepositAsk")) && run(() => confirmDeposit(p.orderId))}>{tk("admin.orders.confirmDeposit")}</button>
          {!p.depositReported && <span className="text-[12px] text-muted">{tk("admin.orders.notReported")}</span>}
        </div>
      )}
      {s === "hold_confirmed" && <button className={btn} disabled={pending} onClick={() => run(() => startQuote(p.orderId))}>{tk("admin.orders.startQuote")}</button>}
      {s === "quoting" && (
        <div className="space-y-2">
          <div className="num flex flex-wrap items-center gap-2">
            <input className={num} inputMode="numeric" value={min} onChange={(e) => setMin(Math.max(0, Math.floor(Number(e.target.value) || 0)))} /> –
            <input className={num} inputMode="numeric" value={max} onChange={(e) => setMax(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            <button className="border border-line px-3 py-1.5 text-[12px]" disabled={pending} onClick={draft}>{tk("admin.orders.draft")}</button>
          </div>
          <input className="w-full border-0 border-b border-line bg-transparent py-1.5 outline-none" maxLength={500} placeholder={tk("admin.orders.quoteNote")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={btn} disabled={pending || max < min} onClick={() => run(() => submitRangeQuote(p.orderId, { min, max, note }))}>{tk("admin.orders.sendRange")}</button>
        </div>
      )}
      {s === "qty_confirmed" && (
        <div className="num flex flex-wrap items-center gap-2">
          <span className="text-ink-2">{tk("order.invoice.logistics")}</span>
          <input className={num} inputMode="numeric" value={fin} onChange={(e) => setFin(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
          {p.range && <span className="text-[11px] text-muted">₩{krw(p.range.min_krw)} – ₩{krw(p.range.max_krw)}</span>}
          <button className={btn} disabled={pending} onClick={() => run(() => submitFinalQuote(p.orderId, { final: fin, note }))}>{tk("admin.orders.sendFinal")}</button>
        </div>
      )}
      {s === "final_quoted" && (
        <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.orders.confirmAsk", { n: krw(p.total) })) && run(() => confirmOrder(p.orderId))}>
          {tk("admin.orders.confirm", { n: krw(p.total) })}
        </button>
      )}
      {s === "cn_shipped" && p.route === "inspect" && <button className={btn} disabled={pending} onClick={() => run(() => receiveOrder(p.orderId))}>{tk("admin.orders.receive")}</button>}
      {((s === "cn_shipped" && p.route === "direct") || (s === "kr_inspecting" && p.hasInspection)) && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="w-48 border border-line bg-surface px-2 py-1.5" maxLength={60} placeholder={tk("cn.tasks.trackingPh")} value={tracking} onChange={(e) => setTracking(e.target.value)} />
          <button className={btn} disabled={pending || tracking.trim().length < 4} onClick={() => run(() => sendOrderToBrand(p.orderId, tracking))}>{tk("admin.orders.send")}</button>
        </div>
      )}
      {s === "report_done" && p.creditIssued === 0 && (
        <div className="num flex flex-wrap items-center gap-2">
          <input className={num} inputMode="numeric" value={credit} onChange={(e) => setCredit(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
          <span className="text-[11px] text-muted">{tk("admin.orders.creditSuggest", { n: krw(p.creditSuggest) })}</span>
          <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.orders.creditAsk", { n: krw(credit) })) && run(() => issueOrderCredit(p.orderId, credit))}>{tk("admin.orders.issueCredit")}</button>
        </div>
      )}
      {cancellable && (
        <button className="text-[12px] text-muted underline-offset-4 hover:text-crit hover:underline" disabled={pending} onClick={() => window.confirm(tk("order.cancelConfirm")) && run(() => adminCancelOrder(p.orderId))}>{tk("order.cancel")}</button>
      )}
      {msg && <p className="text-[12px] text-crit">{msg}</p>}
    </section>
  );
}

/** 본품 검품: 기준서(상품 정보 필드 1:1)별 일치/불일치 + 라인별 통과 수량 + 불량 수량 → 정보 일치율 */
export function BulkInspectionForm({ orderId, criteria, lines }: { orderId: string; criteria: { field: string; expected: string }[]; lines: { lineId: string; label: string; qty: number }[] }) {
  const { pending, msg, run } = useRun();
  const [res, setRes] = useState<Record<string, { match: boolean; actual: string }>>(() => Object.fromEntries(criteria.map((c) => [c.field, { match: true, actual: "" }])));
  const [ok, setOk] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.lineId, l.qty])));
  const defectQty = lines.reduce((s, l) => s + (l.qty - (ok[l.lineId] ?? l.qty)), 0);
  return (
    <section className="space-y-3 border-t border-ink pt-3 text-[13px]">
      <h2 className="text-[15px] font-bold">{tk("admin.orders.inspection")}</h2>
      <ul className="divide-y divide-line">
        {criteria.map((c) => {
          const r = res[c.field];
          return (
            <li key={c.field} className="grid grid-cols-[160px_1fr_auto] items-center gap-2 py-1.5">
              <span className="num text-[12px] text-muted">{c.field}</span>
              <span>{c.expected || "—"}{!r.match && <input className="ml-2 border-0 border-b border-warn bg-transparent py-0.5 outline-none" maxLength={200} placeholder={tk("admin.orders.actual")} value={r.actual} onChange={(e) => setRes({ ...res, [c.field]: { ...r, actual: e.target.value } })} />}</span>
              <button className={`border px-2 py-1 text-[12px] ${r.match ? "border-signature text-signature" : "border-warn text-warn"}`} onClick={() => setRes({ ...res, [c.field]: { ...r, match: !r.match } })}>
                {r.match ? tk("admin.orders.match") : tk("admin.orders.mismatch")}
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.lineId} className="num flex items-center justify-between py-1.5">
            <span>{l.label} <span className="text-muted">×{l.qty}</span></span>
            <label className="flex items-center gap-2 text-[12px] text-ink-2">{tk("admin.orders.okQty")}
              <input type="number" min={0} max={l.qty} className="w-16 border border-line bg-surface px-1 py-1 text-center" value={ok[l.lineId] ?? l.qty}
                onChange={(e) => setOk({ ...ok, [l.lineId]: Math.max(0, Math.min(l.qty, Math.floor(Number(e.target.value) || 0))) })} />
            </label>
          </li>
        ))}
      </ul>
      <p className="num text-[12px] text-ink-2">{tk("admin.orders.defectTotal", { n: defectQty })}</p>
      {msg && <p className="text-[12px] text-crit">{msg}</p>}
      <button className={btn} disabled={pending} onClick={() => run(() => submitBulkInspection(orderId, {
        results: criteria.map((c) => ({ field: c.field, expected: c.expected.slice(0, 200), actual: res[c.field].match ? c.expected.slice(0, 200) : res[c.field].actual, match: res[c.field].match })),
        lines: lines.map((l) => ({ lineId: l.lineId, okQty: ok[l.lineId] ?? l.qty })), defectQty,
      }))}>{tk("admin.orders.saveInspection")}</button>
    </section>
  );
}

/** 미송 라인 관리: 수량·예상 입고일·대응 메모(브랜드에 보인다) · 해결 */
export function BackorderEditor({ lineId, status, qty, eta }: { lineId: string; status: string; qty: number; eta: string | null }) {
  const { pending, msg, run } = useRun();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ qty, eta: eta ?? "", note: "" });
  if (!open) return <button className={`text-[11px] ${status === "backordered" ? "text-warn" : "text-muted"}`} onClick={() => setOpen(true)}>{status === "backordered" ? tk("admin.orders.backorderOpen", { n: qty }) : tk("admin.orders.backorderAdd")}</button>;
  return (
    <div className="num space-y-1 text-[11px]">
      <div className="flex gap-1">
        <input type="number" min={0} className="w-14 border border-line px-1 py-0.5" value={v.qty} onChange={(e) => setV({ ...v, qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        <input type="date" className="border border-line px-1 py-0.5" value={v.eta} onChange={(e) => setV({ ...v, eta: e.target.value })} />
      </div>
      <input className="w-full border border-line px-1 py-0.5" maxLength={300} placeholder={tk("admin.orders.backorderNote")} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <div className="flex gap-2">
        <button className="text-ink disabled:opacity-40" disabled={pending || !v.note.trim()} onClick={() => run(() => updateBackorder(lineId, { qty: v.qty, eta: v.eta || null, note: v.note, resolved: false }))}>{tk("common.save")}</button>
        {status === "backordered" && <button className="text-signature disabled:opacity-40" disabled={pending || !v.note.trim()} onClick={() => run(() => updateBackorder(lineId, { qty: 0, eta: null, note: v.note, resolved: true }))}>{tk("admin.orders.backorderResolve")}</button>}
        <button className="text-muted" onClick={() => setOpen(false)}>×</button>
      </div>
      {msg && <p className="text-crit">{msg}</p>}
    </div>
  );
}
