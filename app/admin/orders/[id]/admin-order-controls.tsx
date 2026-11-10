"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { fmtDate, krw } from "@/lib/format";
import {
  adminCancelOrder, confirmDeposit, confirmOrder, issueOrderCredit, reaggregateStock, rebuildInvoice, recheckStock, requestDeposit,
  draftLogisticsEstimate, sendOrderToBrand, sendQuote, settleLogistics, startStockCheck, submitBulkInspection, submitFinalQuote, updateBackorder,
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
const btn = "btn";
const num = "field num w-32";

/** 체인 단계별 다음 행동 (전이는 서버가 다시 검사한다) */
export function OrderStepControls(p: {
  orderId: string; status: string; holdChoice: string; route: string; depositSuggest: number | null; depositReported: boolean;
  range: { min_krw: number; max_krw: number } | null; finalQuote: number | null; total: number; hasInspection: boolean; creditSuggest: number; creditIssued: number;
  hasInvoice?: boolean;
  settlement?: { estimate_krw: number; actual_krw: number; diff_krw: number; status: string } | null;
  approval?: { state: "ok" | "missing" | "stale" | "changed"; at: string | null; total: number | null; onBehalf: boolean } | null;
}) {
  const { pending, msg, setMsg, run } = useRun();
  const [est, setEst] = useState(p.finalQuote ?? 0);
  const [note, setNote] = useState("");
  const [fin, setFin] = useState(p.finalQuote ?? Math.round(((p.range?.min_krw ?? 0) + (p.range?.max_krw ?? 0)) / 2));
  const [tracking, setTracking] = useState("");
  const [credit, setCredit] = useState(p.creditSuggest);
  const [actual, setActual] = useState(p.finalQuote ?? 0);
  const s = p.status;
  const draft = async () => {
    const r = await draftLogisticsEstimate(p.orderId);
    if (!r.ok) return setMsg(tk(r.error));
    setEst(r.data.estimate);
  };
  // 단순화 v1 O2: 견적 1회 — 물류비 예상 + 메모 → "견적 보내기" (브랜드가 수량 조정·동의를 한 번에)
  const quoteForm = (
    <div className="space-y-4">
      <div className="num flex flex-wrap items-end gap-3">
        <span className="pb-3 text-meta text-ink-2">{tk("admin.orders.logisticsEstimate")}</span>
        <input className={num} aria-label={tk("admin.orders.logisticsEstimate")} inputMode="numeric" value={est} onChange={(e) => setEst(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
        <button className="btn sec sm" disabled={pending} onClick={draft}>{tk("admin.orders.draft")}</button>
      </div>
      <p className="text-caption text-muted">{tk("admin.orders.quoteOnceHelp")}</p>
      <input aria-label={tk("admin.orders.quoteNote")} className="field" maxLength={500} placeholder={tk("admin.orders.quoteNote")} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={btn} disabled={pending || est <= 0} onClick={() => run(() => sendQuote(p.orderId, { logistics: est, note }))}>{tk("admin.orders.sendQuote")}</button>
    </div>
  );
  // confirmed 전 모든 상태 (DECISIONS r5-12) — 선금 환불은 플랫폼 밖
  const cancellable = ["reserved", "stock_checking", "stock_short", "stock_confirmed", "partial_confirmed", "deposit_pending", "hold_confirmed", "quoting", "quoted", "qty_confirmed", "final_quoted"].includes(s);
  return (
    <section className="space-y-4 border-t border-ink pt-5 text-body">
      <div>
        <div className="label">{tk("admin.ui.nextAction")}</div>
        <h2 className="h2 mt-1.5">{tk(`admin.orders.next.${s}`)}</h2>
      </div>
      {s === "reserved" && <button className={btn} disabled={pending} onClick={() => run(() => startStockCheck(p.orderId))}>{tk("admin.orders.startStock")}</button>}
      {s === "stock_checking" && <button className="btn sec sm" disabled={pending} onClick={() => run(() => reaggregateStock(p.orderId))}>{tk("admin.orders.reaggregate")}</button>}
      {s === "stock_short" && <button className={btn} disabled={pending} onClick={() => run(() => recheckStock(p.orderId))}>{tk("admin.orders.recheck")}</button>}
      {(s === "stock_confirmed" || s === "partial_confirmed") && (p.holdChoice === "deposit" ? (
        <button className={btn} disabled={pending} onClick={() => run(() => requestDeposit(p.orderId))}>{tk("admin.orders.requestDeposit", { n: krw(p.depositSuggest ?? 0) })}</button>
      ) : (
        quoteForm
      ))}
      {s === "deposit_pending" && (
        <div className="flex flex-wrap items-center gap-3">
          <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.orders.confirmDepositAsk")) && run(() => confirmDeposit(p.orderId))}>{tk("admin.orders.confirmDeposit")}</button>
          <span className={`st ${p.depositReported ? "warn" : "wait"}`}>{p.depositReported ? tk("admin.orders.reported") : tk("admin.orders.notReported")}</span>
        </div>
      )}
      {(s === "hold_confirmed" || s === "quoting") && quoteForm}
      {s === "qty_confirmed" && (
        <div className="num flex flex-wrap items-end gap-3">
          <span className="pb-3 text-meta text-ink-2">{tk("order.invoice.logistics")}</span>
          <input className={num} aria-label={tk("order.invoice.logistics")} inputMode="numeric" value={fin} onChange={(e) => setFin(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
          {p.range && <span className="text-caption text-muted">₩{krw(p.range.min_krw)} – ₩{krw(p.range.max_krw)}</span>}
          <button className={btn} disabled={pending} onClick={() => run(() => submitFinalQuote(p.orderId, { final: fin, note }))}>{tk("admin.orders.sendFinal")}</button>
        </div>
      )}
      {["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"].includes(s) && (
        // 확정 중간 실패 복구 (DECISIONS r5-3): snapshot이 없으면 바로, 있으면 다시 묻고 강제
        <button className={p.hasInvoice ? "block text-meta text-ink-2 underline underline-offset-4 hover:text-ink" : btn} disabled={pending}
          onClick={() => (!p.hasInvoice || window.confirm(tk("admin.orders.rebuildAsk"))) && run(() => rebuildInvoice(p.orderId, !!p.hasInvoice))}>{tk("admin.orders.rebuild")}</button>
      )}
      {s === "final_quoted" && (p.approval?.state === "ok" ? (
        <div className="space-y-3">
          <button className={`${btn} w-full`} disabled={pending} onClick={() => window.confirm(tk("admin.orders.confirmAsk", { n: krw(p.total) })) && run(() => confirmOrder(p.orderId))}>
            {tk("admin.orders.confirm", { n: krw(p.total) })}
          </button>
          <span className="st done num">{tk("admin.orders.approvedAt", { date: fmtDate(p.approval.at, "ko", true), n: krw(p.approval.total ?? 0) })}{p.approval.onBehalf ? tk("admin.orders.approvedOnBehalf") : ""}</span>
        </div>
      ) : (
        // 브랜드 동의 전에는 확정 버튼을 내지 않는다 (u-10) — 서버도 거부
        <p className="border-l-2 border-l-warn pl-4 text-meta text-warn">
          {p.approval?.state === "changed" ? tk("admin.orders.approvalStale", { n: krw(p.approval.total ?? 0) }) : tk("admin.orders.awaitApproval")}
        </p>
      ))}
      {((s === "cn_shipped" && p.route === "direct") || (s === "kr_inspecting" && p.hasInspection)) && (
        <div className="flex flex-wrap items-end gap-3">
          <input aria-label={tk("cn.tasks.trackingPh")} className="field w-48" maxLength={60} placeholder={tk("cn.tasks.trackingPh")} value={tracking} onChange={(e) => setTracking(e.target.value)} />
          <button className={btn} disabled={pending || tracking.trim().length < 4} onClick={() => run(() => sendOrderToBrand(p.orderId, tracking))}>{tk("admin.orders.send")}</button>
        </div>
      )}
      {/* 실제 물류비 정산(O2): 확정 뒤 한 번 — 10% 넘게 많으면 브랜드 재동의 */}
      {p.hasInvoice && ["cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"].includes(s) && p.settlement?.status !== "applied" && (
        <div className="space-y-2">
          <div className="num flex flex-wrap items-end gap-3">
            <span className="pb-3 text-meta text-ink-2">{tk("admin.orders.logisticsActual")}</span>
            <input className={num} aria-label={tk("admin.orders.logisticsActual")} inputMode="numeric" value={actual} onChange={(e) => setActual(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            <button className="btn sec sm" disabled={pending} onClick={() => run(() => settleLogistics(p.orderId, actual))}>{tk("admin.orders.settle")}</button>
          </div>
          <p className="text-caption text-muted">{p.settlement?.status === "pending_consent"
            ? tk("admin.orders.settlePending", { n: krw(p.settlement.diff_krw) })
            : tk("admin.orders.settleHelp", { n: krw(p.finalQuote ?? 0) })}</p>
        </div>
      )}
      {s === "report_done" && p.creditIssued === 0 && p.creditSuggest > 0 && ( /* 불량 0이면 크레딧 단계 없음 (버튼 점검 11-10) */
        <div className="num flex flex-wrap items-end gap-3">
          <input className={num} aria-label={tk("a11y.creditAmount")} inputMode="numeric" value={credit} onChange={(e) => setCredit(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
          <span className="pb-3 text-caption text-muted">{tk("admin.orders.creditSuggest", { n: krw(p.creditSuggest) })}</span>
          <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.orders.creditAsk", { n: krw(credit) })) && run(() => issueOrderCredit(p.orderId, credit))}>{tk("admin.orders.issueCredit")}</button>
        </div>
      )}
      {cancellable && (
        <button className="block text-meta text-ink-2 underline underline-offset-4 hover:text-crit" disabled={pending} onClick={() => window.confirm(tk("order.cancelConfirm")) && run(() => adminCancelOrder(p.orderId))}>{tk("order.cancel")}</button>
      )}
      {msg && <p className="text-meta text-crit">{msg}</p>}
    </section>
  );
}

/** 본품 검품: 기준서(상품 정보 필드 1:1)별 일치/불일치 + 라인별 통과 수량 + 불량 수량 → 정보 일치율 */
export function BulkInspectionForm({ orderId, criteria, lines }: { orderId: string; criteria: { field: string; expected: string }[]; lines: { lineId: string; label: string; qty: number }[] }) {
  const { pending, msg, run } = useRun();
  const [res, setRes] = useState<Record<string, { match: boolean; actual: string }>>(() => Object.fromEntries(criteria.map((c) => [c.field, { match: true, actual: "" }])));
  const [ok, setOk] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.lineId, l.qty])));
  const defectQty = lines.reduce((s, l) => s + (l.qty - (ok[l.lineId] ?? l.qty)), 0);
  const [tracking, setTracking] = useState("");
  return (
    <div className="space-y-6 text-body">
      <ul>
        {criteria.map((c) => {
          const r = res[c.field];
          return (
            <li key={c.field} className="grid grid-cols-[160px_1fr_auto] items-center gap-3 border-b border-line py-2.5">
              <span className="num text-meta text-muted">{c.field.includes(":") ? `${c.field.split(":")[0]} · ` : ""}{tk(`order.report.field.${c.field.split(":").pop()}`)}</span>
              <span>{c.expected || "—"}{!r.match && <input aria-label={tk("admin.orders.actual")} className="field ml-3 inline-block w-48 border-b-warn" maxLength={200} placeholder={tk("admin.orders.actual")} value={r.actual} onChange={(e) => setRes({ ...res, [c.field]: { ...r, actual: e.target.value } })} />}</span>
              <button className={`btn sm ${r.match ? "sec" : "sec border-warn text-warn"}`} aria-pressed={!r.match} onClick={() => setRes({ ...res, [c.field]: { ...r, match: !r.match } })}>
                {r.match ? tk("admin.orders.match") : tk("admin.orders.mismatch")}
              </button>
            </li>
          );
        })}
      </ul>
      <ul>
        {lines.map((l) => (
          <li key={l.lineId} className="num flex items-center justify-between gap-4 border-b border-line py-2">
            <span>{l.label} <span className="text-muted">×{l.qty}</span></span>
            <label className="flex items-center gap-3 text-meta text-ink-2">{tk("admin.orders.okQty")}
              <input type="number" min={0} max={l.qty} className="field num w-20 text-right" value={ok[l.lineId] ?? l.qty}
                onChange={(e) => setOk({ ...ok, [l.lineId]: Math.max(0, Math.min(l.qty, Math.floor(Number(e.target.value) || 0))) })} />
            </label>
          </li>
        ))}
      </ul>
      <p className="num text-meta text-ink-2">{tk("admin.orders.defectTotal", { n: defectQty })}</p>
      {msg && <p className="text-meta text-crit">{msg}</p>}
      {/* O3: 국내 운송장을 넣으면 검품 저장과 브랜드 발송을 한 번에 */}
      <div className="flex flex-wrap items-end gap-3">
        <input aria-label={tk("cn.tasks.trackingPh")} className="field w-48" maxLength={60} placeholder={tk("admin.orders.trackingOptional")} value={tracking} onChange={(e) => setTracking(e.target.value)} />
        <button className={btn} disabled={pending || (tracking.trim().length > 0 && tracking.trim().length < 4)} onClick={() => run(() => submitBulkInspection(orderId, {
          results: criteria.map((c) => ({ field: c.field, expected: c.expected.slice(0, 200), actual: res[c.field].match ? c.expected.slice(0, 200) : res[c.field].actual, match: res[c.field].match })),
          lines: lines.map((l) => ({ lineId: l.lineId, okQty: ok[l.lineId] ?? l.qty })), defectQty, ...(tracking.trim() ? { tracking: tracking.trim() } : {}),
        }))}>{tracking.trim() ? tk("admin.orders.inspectAndSend") : tk("admin.orders.saveInspection")}</button>
      </div>
    </div>
  );
}

/** 미송 라인 관리: 수량·예상 입고일·대응 메모(브랜드에 보인다) · 해결 */
export function BackorderEditor({ lineId, status, qty, eta }: { lineId: string; status: string; qty: number; eta: string | null }) {
  const { pending, msg, run } = useRun();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ qty, eta: eta ?? "", note: "" });
  if (!open) return <button className={`text-caption underline-offset-4 hover:underline ${status === "backordered" ? "text-warn" : "text-ink-2"}`} onClick={() => setOpen(true)}>{status === "backordered" ? tk("admin.orders.backorderOpen", { n: qty }) : tk("admin.orders.backorderAdd")}</button>;
  return (
    <div className="num w-56 space-y-2 text-caption">
      <div className="flex gap-2">
        <input type="number" min={0} aria-label={tk("a11y.backorderQty")} className="field w-16 text-meta" value={v.qty} onChange={(e) => setV({ ...v, qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        <input type="date" aria-label={tk("a11y.backorderEta")} className="field flex-1 text-meta" value={v.eta} onChange={(e) => setV({ ...v, eta: e.target.value })} />
      </div>
      <input aria-label={tk("admin.orders.backorderNote")} className="field text-meta" maxLength={300} placeholder={tk("admin.orders.backorderNote")} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <div className="flex gap-4">
        <button className="font-medium text-ink disabled:opacity-40" disabled={pending || !v.note.trim()} onClick={() => run(() => updateBackorder(lineId, { qty: v.qty, eta: v.eta || null, note: v.note, resolved: false }))}>{tk("common.save")}</button>
        {status === "backordered" && <button className="text-ink-2 hover:text-ink disabled:opacity-40" disabled={pending || !v.note.trim()} onClick={() => run(() => updateBackorder(lineId, { qty: 0, eta: null, note: v.note, resolved: true }))}>{tk("admin.orders.backorderResolve")}</button>}
        <button className="text-ink-2 hover:text-ink" onClick={() => setOpen(false)}>{tk("common.close")}</button>
      </div>
      {msg && <p className="text-crit">{msg}</p>}
    </div>
  );
}
