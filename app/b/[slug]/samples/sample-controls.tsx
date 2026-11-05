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
const btn = "btn";

/** 입금 안내 안의 "입금 신고" (확인은 관리자) */
export function ReportPayment({ brandId, sampleId }: { brandId: string; sampleId: string }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-4">
      <input aria-label={tk("payment.notice.notePh")} className="field min-w-0 flex-1 basis-48" placeholder={tk("payment.notice.notePh")} maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={`${btn} max-sm:w-full`} disabled={pending} onClick={() => run(() => reportPayment(brandId, sampleId, note))}>{tk("payment.notice.report")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

export function SampleHeaderActions({ brandId, sampleId, canCancel, canReceive }: { brandId: string; sampleId: string; canCancel: boolean; canReceive: boolean }) {
  const { pending, msg, run } = useRun();
  if (!canCancel && !canReceive) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {canReceive && <button className={`${btn} max-sm:w-full`} disabled={pending} onClick={() => run(() => markDelivered(brandId, sampleId))}>{tk("sample.received")}</button>}
      {canCancel && (
        <button className="min-h-11 text-meta text-ink-2 hover:text-crit" disabled={pending}
          onClick={() => window.confirm(tk("sample.cancelConfirm")) && run(() => cancelSample(brandId, sampleId))}>{tk("sample.cancel")}</button>
      )}
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

/**
 * `.choice` 라디오 카드 한 장 (디자인 v2.3 "샘플 상세"). 진짜 radio는 숨기고(sr-only) 카드 전체가 라벨 — 키보드·스크린리더 그대로.
 * 고른 카드 안에서만 추가 입력(운송장·거절 사유)을 보인다.
 */
function Choice({ name, value, on, title, desc, onPick, children }: {
  name: string; value: string; on: boolean; title: string; desc: string; onPick: () => void; children?: React.ReactNode;
}) {
  return (
    <label className={on ? "on" : undefined}>
      <input type="radio" className="sr-only" name={name} value={value} checked={on} onChange={onPick} />
      <span className="radio" aria-hidden />
      <span className="min-w-0">
        <span className="t">{title}</span>
        <span className="d">{desc}</span>
        {on && children}
      </span>
    </label>
  );
}

const REASONS = ["price", "design", "fabric", "leadtime", "other"] as const;
type Feedback = "interested" | "hold" | "declined";
/**
 * 피드백 전(delivered): 관심 / 보류 / 거절 중 하나 → "피드백 보내기" 하나. variant별 피드백 → 제안 반응 동기화(서버 giveSampleFeedback 그대로).
 * 거절은 사유(칩) 필수 + 한 줄 메모 — 거절 카드 안에서.
 */
export function FeedbackChoice({ brandId, itemId, current }: { brandId: string; itemId: string; current: string | null }) {
  const [pick, setPick] = useState<Feedback | null>((["interested", "hold", "declined"] as const).find((x) => x === current) ?? null);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const { pending, msg, run } = useRun();
  const name = `fb-${itemId}`;
  const send = () => {
    if (!pick) return;
    run(() => giveSampleFeedback(brandId, itemId, pick === "declined" ? { feedback: "declined", reason: reason!, note } : { feedback: pick }));
  };
  return (
    <div>
      <div className="choice" role="radiogroup" aria-label={tk("sample.fact.feedback")}>
        <Choice name={name} value="interested" on={pick === "interested"} title={tk("status.offer.interested")} desc={tk("sample.choice.interestedDesc")} onPick={() => setPick("interested")} />
        <Choice name={name} value="hold" on={pick === "hold"} title={tk("status.offer.hold")} desc={tk("sample.choice.holdDesc")} onPick={() => setPick("hold")} />
        <Choice name={name} value="declined" on={pick === "declined"} title={tk("status.offer.declined")} desc={tk("sample.choice.declinedDesc")} onPick={() => setPick("declined")}>
          <span className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={tk("offer.declineReason")}>
            {REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className="chip" aria-pressed={reason === r}>{tk(`decline.${r}`)}</button>)}
          </span>
          <span className="mt-3 block max-w-[480px]">
            <input className="field" aria-label={tk("offer.declineNote")} placeholder={tk("offer.declineNote")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </span>
        </Choice>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" className="btn lg max-sm:w-full" disabled={pending || !pick || (pick === "declined" && !reason)} onClick={send}>{tk("sample.choice.feedbackSubmit")}</button>
        {msg && <span className="text-meta text-crit">{msg}</span>}
      </div>
    </div>
  );
}

/**
 * 피드백 뒤 회수(feedback_done · return due): "돌려보낼게요"(운송장) / "갖고 있을게요 (미회수)" 둘 중 하나 → "회수 신청" 하나.
 * 서버 setSampleReturn 그대로(return | keep) — 미회수는 구매 권한자만(서버가 다시 거부), 관리자가 확정하면 상품가 청구.
 */
export function ReturnChoice({ brandId, itemId, productFee, canPurchase }: { brandId: string; itemId: string; productFee: string; canPurchase: boolean }) {
  const [mode, setMode] = useState<"return" | "keep">("return");
  const [tracking, setTracking] = useState("");
  const { pending, msg, run } = useRun();
  const name = `rt-${itemId}`;
  const send = () => {
    if (mode === "keep") {
      if (window.confirm(tk("sample.keep.confirm", { n: productFee }))) run(() => setSampleReturn(brandId, itemId, { mode: "keep" }));
      return;
    }
    run(() => setSampleReturn(brandId, itemId, { mode: "return", tracking }));
  };
  return (
    <div>
      <div className="choice" role="radiogroup" aria-label={tk("sample.return.submit")}>
        <Choice name={name} value="return" on={mode === "return"} title={tk("sample.choice.return")} desc={tk("sample.choice.returnDesc")} onPick={() => setMode("return")}>
          <span className="mt-3 block max-w-[320px]">
            <input className="field" aria-label={tk("sample.return.trackingPh")} placeholder={tk("sample.return.trackingPh")} maxLength={40} value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </span>
        </Choice>
        {canPurchase && (
          <Choice name={name} value="keep" on={mode === "keep"} title={tk("sample.choice.keep")} desc={tk("sample.choice.keepDesc", { n: productFee })} onPick={() => setMode("keep")} />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" className="btn lg max-sm:w-full" disabled={pending || (mode === "return" && tracking.trim().length < 4)} onClick={send}>{tk("sample.return.submit")}</button>
        {msg && <span className="text-meta text-crit">{msg}</span>}
      </div>
    </div>
  );
}
