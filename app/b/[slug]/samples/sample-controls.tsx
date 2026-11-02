"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { cancelSample, giveSampleFeedback, markDelivered, reportPayment, setSampleReturn } from "./actions";

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
const btn = "bg-ink px-4 py-2 text-body font-medium text-paper disabled:opacity-40";

/** 입금 안내 카드 안의 "입금했어요" 신고 (확인은 관리자) */
export function ReportPayment({ brandId, sampleId }: { brandId: string; sampleId: string }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={tk("payment.notice.notePh")} className="flex-1 border-0 border-b border-line bg-transparent py-1.5 text-body outline-none" placeholder={tk("payment.notice.notePh")} maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={btn} disabled={pending} onClick={() => run(() => reportPayment(brandId, sampleId, note))}>{tk("payment.notice.report")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

export function SampleHeaderActions({ brandId, sampleId, canCancel, canReceive }: { brandId: string; sampleId: string; canCancel: boolean; canReceive: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canReceive && <button className={btn} disabled={pending} onClick={() => run(() => markDelivered(brandId, sampleId))}>{tk("sample.received")}</button>}
      {canCancel && (
        <button className="text-meta text-muted underline-offset-4 hover:text-crit hover:underline" disabled={pending}
          onClick={() => window.confirm(tk("sample.cancelConfirm")) && run(() => cancelSample(brandId, sampleId))}>{tk("sample.cancel")}</button>
      )}
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

const REASONS = ["price", "design", "fabric", "leadtime", "other"] as const;
/** variant별 피드백 → 제안 반응 동기화 (관심이어야 7단계 발주서에 담을 수 있다) */
export function ItemFeedback({ brandId, itemId, current }: { brandId: string; itemId: string; current: string | null }) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const { pending, msg, run } = useRun();
  const b = (on: boolean) => `flex-1 border px-2 py-1.5 text-meta ${on ? "border-ink bg-ink text-paper" : "border-line bg-surface"}`;
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button className={b(current === "interested")} disabled={pending} onClick={() => run(() => giveSampleFeedback(brandId, itemId, { feedback: "interested" }))}>♥ {tk("status.offer.interested")}</button>
        <button className={b(current === "hold")} disabled={pending} onClick={() => run(() => giveSampleFeedback(brandId, itemId, { feedback: "hold" }))}>{tk("status.offer.hold")}</button>
        <button className={b(current === "declined")} disabled={pending} onClick={() => setDeclining((x) => !x)}>{tk("status.offer.declined")} ▾</button>
      </div>
      {declining && (
        <div className="space-y-2 bg-surface p-2">
          <div className="flex flex-wrap gap-1">
            {REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className={`border px-2 py-1 text-meta ${reason === r ? "border-ink bg-ink text-paper" : "border-line"}`}>{tk(`decline.${r}`)}</button>)}
          </div>
          <input aria-label={tk("offer.declineNote")} className="w-full border-0 border-b border-line bg-transparent py-1.5 text-body outline-none" placeholder={tk("offer.declineNote")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="w-full bg-ink py-1.5 text-meta text-paper disabled:opacity-40" disabled={pending || !reason} onClick={() => run(() => giveSampleFeedback(brandId, itemId, { feedback: "declined", reason: reason!, note }))}>{tk("offer.declineSubmit")}</button>
        </div>
      )}
      {msg && <p className="text-meta text-crit">{msg}</p>}
    </div>
  );
}

/** 회수 신청(반납 운송장) 또는 보유 선택 — 보유는 관리자가 미회수 확정 시 상품가 청구 */
export function ItemReturn({ brandId, itemId, productFee, canPurchase = true }: { brandId: string; itemId: string; productFee: string; canPurchase?: boolean }) {
  const [tracking, setTracking] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-1.5 text-meta">
      <div className="flex gap-2">
        <input aria-label={tk("sample.return.trackingPh")} className="flex-1 border-0 border-b border-line bg-transparent py-1.5 outline-none" placeholder={tk("sample.return.trackingPh")} maxLength={40} value={tracking} onChange={(e) => setTracking(e.target.value)} />
        <button className="border border-ink px-3 py-1.5 disabled:opacity-40" disabled={pending || tracking.trim().length < 4} onClick={() => run(() => setSampleReturn(brandId, itemId, { mode: "return", tracking }))}>{tk("sample.return.submit")}</button>
      </div>
      {canPurchase && (
        <button className="text-muted underline-offset-4 hover:underline" disabled={pending} onClick={() => window.confirm(tk("sample.keep.confirm", { n: productFee })) && run(() => setSampleReturn(brandId, itemId, { mode: "keep" }))}>
          {tk("sample.keep.submit", { n: productFee })}
        </button>
      )}
      {msg && <p className="text-crit">{msg}</p>}
    </div>
  );
}
