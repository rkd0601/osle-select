"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/cn";
import { respondStock, shipOrderLines } from "./order-actions";

type Line = { id: string; label: string; expected: number };

/** C-05 재고 확인 응답: 라인별 확보/부족 + 확보 수량 + 메모(zh). 모든 라인이 응답되면 발주서가 확인 완료로 넘어간다 */
export function StockForm({ orderId, lines, locale }: { orderId: string; lines: Line[]; locale: Locale }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, { result: "confirmed" | "short"; qty: number; note: string }>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { result: "confirmed" as const, qty: l.expected, note: "" }])),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const x = v[l.id];
          return (
            <li key={l.id} className="grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-[1fr_auto]">
              <span className="min-w-0">{l.label} <span className="num font-semibold text-ink-2">×{l.expected}</span></span>
              <span className="flex items-center gap-1.5">
                <button aria-pressed={x.result === "confirmed"} className={`btn btn-sm min-h-10 flex-1 border sm:flex-none ${x.result === "confirmed" ? "border-ink bg-ink text-paper" : "border-line-strong bg-surface text-ink"}`} onClick={() => setV({ ...v, [l.id]: { ...x, result: "confirmed", qty: l.expected } })}>{t(locale, "cn.order.confirmed")}</button>
                <button aria-pressed={x.result === "short"} className={`btn btn-sm min-h-10 flex-1 border sm:flex-none ${x.result === "short" ? "border-warn bg-warn-soft text-warn" : "border-line-strong bg-surface text-ink"}`} onClick={() => setV({ ...v, [l.id]: { ...x, result: "short", qty: 0 } })}>{t(locale, "cn.order.short")}</button>
                <input type="number" min={0} max={l.expected} aria-label={t(locale, "cn.order.securedQty")} className="field num min-h-10 w-20 px-2 text-center" value={x.qty}
                  onChange={(e) => setV({ ...v, [l.id]: { ...x, qty: Math.max(0, Math.min(l.expected, Math.floor(Number(e.target.value) || 0))) } })} />
              </span>
              {x.result === "short" && (
                <input aria-label={t(locale, "cn.order.notePh")} className="field text-meta sm:col-span-2" maxLength={200} placeholder={t(locale, "cn.order.notePh")} value={x.note} onChange={(e) => setV({ ...v, [l.id]: { ...x, note: e.target.value } })} />
              )}
            </li>
          );
        })}
      </ul>
      <button className="btn btn-primary min-h-10 w-full sm:w-auto" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await respondStock(orderId, lines.map((l) => ({ lineId: l.id, result: v[l.id].result, confirmedQty: v[l.id].qty, note: v[l.id].note })));
        if (!r.ok) return setMsg(t(locale, r.error));
        router.refresh();
      })}>{t(locale, "cn.order.submitStock")}</button>
      {msg && <span className="block text-meta text-crit sm:ml-2 sm:inline">{msg}</span>}
    </div>
  );
}

/** C-05 발주 출고: 본인 라인 전체를 한 운송장으로 */
export function OrderShipForm({ orderId, locale }: { orderId: string; locale: Locale }) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={t(locale, "cn.tasks.trackingPh")} className="field num min-h-10 min-w-0 flex-1 basis-48" placeholder={t(locale, "cn.tasks.trackingPh")} maxLength={60} value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button className="btn btn-primary min-h-10" disabled={pending || tracking.trim().length < 4} onClick={() => start(async () => {
        setMsg(null);
        const r = await shipOrderLines(orderId, tracking);
        if (!r.ok) return setMsg(t(locale, r.error));
        router.refresh();
      })}>{t(locale, "cn.tasks.ship")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}
