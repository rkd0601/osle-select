"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/cn";
import { respondStock, shipOrderLines } from "./order-actions";

type Line = { id: string; name: string; code: string | null; expected: number };

/**
 * C-05 재고 확인 응답: 라인(상품명+코드 / ×수량 / 有货·不足 세그먼트) → 부족이면 확보 수량 + 메모(zh) → 오른쪽 아래 제출.
 * 모든 라인이 응답되면 발주서가 확인 완료로 넘어간다. "확보"인데 수량이 적으면 서버가 부족으로 바꾼다.
 */
export function StockForm({ orderId, lines, locale }: { orderId: string; lines: Line[]; locale: Locale }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, { result: "confirmed" | "short"; qty: number; note: string }>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { result: "confirmed" as const, qty: l.expected, note: "" }])),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {lines.map((l) => {
        const x = v[l.id];
        return (
          <div key={l.id} className="border-b border-line">
            <div className="line" style={{ borderBottom: 0 }}>
              <div className="n min-w-0">{l.name}<small>{l.code}</small></div>
              <span className="qty num">×{l.expected}</span>
              <div className="seg" role="group" aria-label={l.name}>
                <button type="button" aria-pressed={x.result === "confirmed"} className={x.result === "confirmed" ? "on" : undefined} onClick={() => setV({ ...v, [l.id]: { ...x, result: "confirmed", qty: l.expected } })}>{t(locale, "cn.order.confirmed")}</button>
                <button type="button" aria-pressed={x.result === "short"} className={x.result === "short" ? "on" : undefined} onClick={() => setV({ ...v, [l.id]: { ...x, result: "short", qty: 0 } })}>{t(locale, "cn.order.short")}</button>
              </div>
            </div>
            {x.result === "short" && (
              <div className="grid grid-cols-[96px_1fr] gap-4 pb-3">
                <div className="field">
                  <label htmlFor={`q-${l.id}`}>{t(locale, "cn.order.securedQty")}</label>
                  <input id={`q-${l.id}`} type="number" min={0} max={l.expected} inputMode="numeric" className="num" value={x.qty}
                    onChange={(e) => setV({ ...v, [l.id]: { ...x, qty: Math.max(0, Math.min(l.expected, Math.floor(Number(e.target.value) || 0))) } })} />
                </div>
                <div className="field min-w-0">
                  <label htmlFor={`n-${l.id}`}>{t(locale, "cn.order.notePh")}</label>
                  <input id={`n-${l.id}`} maxLength={200} value={x.note} onChange={(e) => setV({ ...v, [l.id]: { ...x, note: e.target.value } })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="foot flex-wrap items-center gap-3">
        {msg && <span role="alert" className="text-meta text-crit">{msg}</span>}
        <button type="button" className="btn max-sm:w-full" disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const r = await respondStock(orderId, lines.map((l) => ({ lineId: l.id, result: v[l.id].result, confirmedQty: v[l.id].qty, note: v[l.id].note })));
          if (!r.ok) return setMsg(t(locale, r.error));
          router.refresh();
        })}>{t(locale, "cn.order.submitStock")}</button>
      </div>
    </>
  );
}

/** C-05 발주 출고: 본인 라인 전체를 한 운송장으로 — 밑줄 입력 + 오른쪽 버튼 */
export function OrderShipForm({ orderId, locale }: { orderId: string; locale: Locale }) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <TrackingFoot locale={locale} id={`trk-${orderId}`} value={tracking} onChange={setTracking} maxLength={60} msg={msg} pending={pending}
      onSubmit={() => start(async () => {
        setMsg(null);
        const r = await shipOrderLines(orderId, tracking);
        if (!r.ok) return setMsg(t(locale, r.error));
        router.refresh();
      })} />
  );
}

/** 작업 블록 바닥: 운송장 밑줄 입력(왼쪽, 늘어남) + 버튼(오른쪽). 샘플 출고(ship-form)도 같이 쓴다 */
export function TrackingFoot({ locale, id, value, onChange, maxLength, msg, pending, onSubmit }: {
  locale: Locale; id: string; value: string; onChange: (v: string) => void; maxLength: number; msg: string | null; pending: boolean; onSubmit: () => void;
}) {
  return (
    <div className="foot flex-wrap items-end gap-x-4 gap-y-3">
      <div className="field min-w-0 flex-1 basis-48">
        <label htmlFor={id}>{t(locale, "cn.tasks.trackingPh")}</label>
        <input id={id} className="num" maxLength={maxLength} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <button type="button" className="btn max-sm:w-full" disabled={pending || value.trim().length < 4} onClick={onSubmit}>{t(locale, "cn.tasks.ship")}</button>
      {msg && <span role="alert" className="w-full text-right text-meta text-crit">{msg}</span>}
    </div>
  );
}
