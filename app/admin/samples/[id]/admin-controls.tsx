"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { resizeToWebp } from "@/lib/images/resize";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { BUCKETS } from "@/lib/config";
import {
  adminCancelSample, closeSample, closeSampleFeedback, confirmSamplePayment, creditUnavailableItem, confirmSampleReturned, confirmSampleUnreturned, inspectSampleItem, issueSamplePhotoUpload, markSampleArrived, sendSampleToBrand,
} from "../actions";

type R = { ok: true } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<R>, confirmKey?: string) =>
    start(async () => {
      if (confirmKey && !window.confirm(tk(confirmKey))) return;
      setMsg(null);
      const r = await fn();
      setMsg(tk(r.ok ? "common.saved" : r.error));
      if (r.ok) router.refresh();
    });
  return { pending, msg, run };
}
const btn = "bg-ink px-3 py-1.5 text-meta text-paper disabled:opacity-40";
const input = "border border-line bg-surface px-2 py-1.5 text-body";

/** 요청서 단위 행위 — 돈 관련(입금 확인)은 확인 단계 + 감사 로그 */
export function SampleStepControls({ sampleId, status, feedbackOverdue = false }: { sampleId: string; status: string; feedbackOverdue?: boolean }) {
  const [tracking, setTracking] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "awaiting_payment" && <button className={btn} disabled={pending} onClick={() => run(() => confirmSamplePayment(sampleId), "admin.samples.confirmPayment.confirm")}>{tk("admin.samples.confirmPayment")}</button>}
      {status === "cn_shipped" && <button className={btn} disabled={pending} onClick={() => run(() => markSampleArrived(sampleId))}>{tk("admin.samples.arrived")}</button>}
      {status === "inspected" && (
        <>
          <input aria-label={tk("admin.samples.trackingPh")} className={input} placeholder={tk("admin.samples.trackingPh")} value={tracking} maxLength={40} onChange={(e) => setTracking(e.target.value)} />
          <button className={btn} disabled={pending || tracking.trim().length < 4} onClick={() => run(() => sendSampleToBrand(sampleId, tracking))}>{tk("admin.samples.send")}</button>
        </>
      )}
      {status === "feedback_done" && <button className={btn} disabled={pending} onClick={() => run(() => closeSample(sampleId))}>{tk("admin.samples.close")}</button>}
      {status === "delivered" && feedbackOverdue && <button className={btn} disabled={pending} onClick={() => run(() => closeSampleFeedback(sampleId), "admin.samples.closeFeedback.confirm")}>{tk("admin.samples.closeFeedback")}</button>}
      {["requested", "awaiting_payment"].includes(status) && <button className="text-meta text-muted underline" disabled={pending} onClick={() => run(() => adminCancelSample(sampleId), "sample.cancelConfirm")}>{tk("sample.cancel")}</button>}
      {msg && <span className="text-meta text-ink-2">{msg}</span>}
    </div>
  );
}

/** variant별 검품: OK/불량(템플릿)/불가 + 사진 1장 + 내부 메모 + 실측 보완 */
export function InspectControls({ itemId, defects, size }: { itemId: string; defects: readonly string[]; size: { id: string; parts: string[]; measurements: Record<string, number> } | null }) {
  const [status, setStatus] = useState<"ok" | "defect" | "unavailable">("ok");
  const [defect, setDefect] = useState<string>(defects[0]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [m, setM] = useState<Record<string, number>>(size?.measurements ?? {});
  const [measure, setMeasure] = useState(false);
  const { pending, msg, run } = useRun();
  async function pick(f: File | undefined) {
    if (!f) return;
    const blob = await resizeToWebp(f);
    const issued = await issueSamplePhotoUpload(itemId);
    if (issued.ok && (await uploadToSignedUrl(BUCKETS.samplePhotos, issued.data.path, issued.data.token, blob))) setPhoto(issued.data.path);
  }
  return (
    <div className="space-y-2 text-meta">
      <div className="flex gap-1">
        {(["ok", "defect", "unavailable"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`border px-2 py-1 ${status === s ? "border-ink bg-ink text-paper" : "border-line"}`}>{tk(`sample.inspect.${s}`)}</button>
        ))}
      </div>
      {status === "defect" && (
        <select className={input} aria-label={tk("a11y.defectReason")} value={defect} onChange={(e) => setDefect(e.target.value)}>
          {defects.map((d) => <option key={d} value={d}>{tk(`sample.defect.${d}`)}</option>)}
        </select>
      )}
      <label className="block">{tk("admin.samples.photo")} {photo ? "✔" : ""}<input type="file" accept="image/*" className="block text-caption" onChange={(e) => pick(e.target.files?.[0])} /></label>
      <input aria-label={tk("admin.samples.noteInternal")} className={`${input} w-full`} placeholder={tk("admin.samples.noteInternal")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      {size && (
        <div>
          <label className="flex items-center gap-1"><input type="checkbox" checked={measure} onChange={(e) => setMeasure(e.target.checked)} />{tk("admin.samples.measure")}</label>
          {measure && (
            <div className="mt-1 flex flex-wrap gap-1">
              {size.parts.map((p) => (
                <label key={p} className="text-caption text-muted">{tk(`measure.${p}`)}
                  <input className={`${input} num block w-16`} inputMode="decimal" value={m[p] ?? ""} onChange={(e) => setM({ ...m, [p]: Number(e.target.value) || 0 })} />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <button className={btn} disabled={pending} onClick={() => run(() => inspectSampleItem(itemId, {
        status, defect: status === "defect" ? defect : null, photoPath: photo, noteInternal: note,
        measured: measure && size ? { sizeId: size.id, measurements: Object.fromEntries(Object.entries(m).filter(([, v]) => v > 0)) } : null,
      }))}>{tk("admin.samples.saveInspection")}</button>
      {msg && <span className="ml-2 text-ink-2">{msg}</span>}
    </div>
  );
}

/** 회수 접수 · 미회수 확정(수동 — 상품가 청구 + 브랜드 알림 + 감사 로그) */
export function ReturnControls({ itemId, overdue, amount }: { itemId: string; overdue: boolean; amount: string }) {
  const [loc, setLoc] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2 text-meta">
      <input aria-label={tk("admin.samples.locationPh")} className={input} placeholder={tk("admin.samples.locationPh")} value={loc} maxLength={60} onChange={(e) => setLoc(e.target.value)} />
      <button className="border border-ink px-2 py-1" disabled={pending} onClick={() => run(() => confirmSampleReturned(itemId, loc))}>{tk("admin.samples.returned")}</button>
      <button className={`border px-2 py-1 ${overdue ? "border-crit text-crit" : "border-line text-ink-2"}`} disabled={pending}
        onClick={() => window.confirm(tk("admin.samples.unreturned.confirm", { n: amount })) && run(() => confirmSampleUnreturned(itemId))}>{tk("admin.samples.unreturned", { n: amount })}</button>
      {msg && <span className="text-ink-2">{msg}</span>}
    </div>
  );
}

/** 미도착 항목 크레딧 (브랜드 크레딧 잔액 → 다음 발주 확정에서 차감) */
export function UnavailableCredit({ itemId }: { itemId: string }) {
  const [n, setN] = useState(0);
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2 text-meta">
      <input className={input} aria-label={tk("a11y.creditAmount")} inputMode="numeric" value={n || ""} placeholder="₩" onChange={(e) => setN(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
      <button className="border border-ink px-2 py-1 disabled:opacity-40" disabled={pending || n < 1} onClick={() => run(() => creditUnavailableItem(itemId, n), "admin.samples.credit.confirm")}>{tk("admin.samples.credit")}</button>
      {msg && <span className="text-ink-2">{msg}</span>}
    </div>
  );
}
