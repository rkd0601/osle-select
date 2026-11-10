"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { shrinkPhoto } from "@/lib/images/resize";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { BUCKETS } from "@/lib/config";
import {
  adminCancelSample, closeSample, closeSampleFeedback, confirmSamplePayment, creditUnavailableItem, confirmSampleReturned, confirmSampleUnreturned, inspectSampleItem, issueSamplePhotoUpload, sendSampleToBrand,
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
const btn = "btn sm";
const input = "field";

/** 요청서 단위 행위 — 돈 관련(입금 확인)은 확인 단계 + 감사 로그 */
export function SampleStepControls({ sampleId, status, feedbackOverdue = false }: { sampleId: string; status: string; feedbackOverdue?: boolean }) {
  const [tracking, setTracking] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-3">
      {status === "awaiting_payment" && <button className={btn} disabled={pending} onClick={() => run(() => confirmSamplePayment(sampleId), "admin.samples.confirmPayment.confirm")}>{tk("admin.samples.confirmPayment")}</button>}
      {status === "cn_shipped" && <p className="text-meta text-ink-2">{tk("admin.samples.inspectToArrive")}</p>}
      {status === "inspected" && (
        <>
          <input aria-label={tk("admin.samples.trackingPh")} className={`${input} w-44`} placeholder={tk("admin.samples.trackingPh")} value={tracking} maxLength={40} onChange={(e) => setTracking(e.target.value)} />
          <button className={btn} disabled={pending || tracking.trim().length < 4} onClick={() => run(() => sendSampleToBrand(sampleId, tracking))}>{tk("admin.samples.send")}</button>
        </>
      )}
      {status === "feedback_done" && <button className={btn} disabled={pending} onClick={() => run(() => closeSample(sampleId))}>{tk("admin.samples.close")}</button>}
      {status === "delivered" && feedbackOverdue && <button className={btn} disabled={pending} onClick={() => run(() => closeSampleFeedback(sampleId), "admin.samples.closeFeedback.confirm")}>{tk("admin.samples.closeFeedback")}</button>}
      {["requested", "awaiting_payment"].includes(status) && <button className="text-meta text-ink-2 underline underline-offset-4 hover:text-crit" disabled={pending} onClick={() => run(() => adminCancelSample(sampleId), "sample.cancelConfirm")}>{tk("sample.cancel")}</button>}
      {msg && <span className="basis-full text-meta text-ink-2">{msg}</span>}
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
    const blob = await shrinkPhoto(f).catch(() => null);
    if (!blob) return;
    const issued = await issueSamplePhotoUpload(itemId);
    if (issued.ok && (await uploadToSignedUrl(BUCKETS.samplePhotos, issued.data.path, issued.data.token, blob))) setPhoto(issued.data.path);
  }
  return (
    <div className="space-y-4 text-meta">
      <div className="seg">
        {(["ok", "defect", "unavailable"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={status === s ? "on" : ""}>{tk(`sample.inspect.${s}`)}</button>
        ))}
      </div>
      {status === "defect" && (
        <select className={`${input} w-full`} aria-label={tk("a11y.defectReason")} value={defect} onChange={(e) => setDefect(e.target.value)}>
          {defects.map((d) => <option key={d} value={d}>{tk(`sample.defect.${d}`)}</option>)}
        </select>
      )}
      <label className="block text-ink-2">{tk("admin.samples.photo")}{photo && <span className="st done ml-3">{tk("admin.samples.photoReady")}</span>}<input type="file" accept="image/*" className="mt-1.5 block text-caption" onChange={(e) => pick(e.target.files?.[0])} /></label>
      <input aria-label={tk("admin.samples.noteInternal")} className={`${input} w-full`} placeholder={tk("admin.samples.noteInternal")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      {size && (
        <div>
          <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" checked={measure} onChange={(e) => setMeasure(e.target.checked)} />{tk("admin.samples.measure")}</label>
          {measure && (
            <div className="mt-2 flex flex-wrap gap-3">
              {size.parts.map((p) => (
                <label key={p} className="field w-16"><span className="lbl">{tk(`measure.${p}`)}</span>
                  <input className="num" inputMode="decimal" value={m[p] ?? ""} onChange={(e) => setM({ ...m, [p]: Number(e.target.value) || 0 })} />
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
/** 회수 확인 / 구매 확정(청구 합산, d-27). 브랜드가 구매를 골랐으면(chosen) 구매 확정이 먼저 — 그래도 실물이 돌아오면 회수 확인 가능 */
export function ReturnControls({ itemId, overdue, amount, chosen = false }: { itemId: string; overdue: boolean; amount: string; chosen?: boolean }) {
  const [loc, setLoc] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-3 text-meta">
      {chosen && <span className="st warn w-full">{tk("admin.samples.decision.purchased")}</span>}
      <input aria-label={tk("admin.samples.locationPh")} className={`${input} w-44`} placeholder={tk("admin.samples.locationPh")} value={loc} maxLength={60} onChange={(e) => setLoc(e.target.value)} />
      <button className="btn sec sm" disabled={pending} onClick={() => run(() => confirmSampleReturned(itemId, loc))}>{tk("admin.samples.returned")}</button>
      <button className={`btn ${chosen ? "" : "sec"} sm ${overdue && !chosen ? "border-crit text-crit" : ""}`} disabled={pending}
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
    <div className="flex flex-wrap items-end gap-3 text-meta">
      <input className={`${input} num w-36`} aria-label={tk("a11y.creditAmount")} inputMode="numeric" value={n || ""} placeholder="₩" onChange={(e) => setN(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
      <button className="btn sec sm" disabled={pending || n < 1} onClick={() => run(() => creditUnavailableItem(itemId, n), "admin.samples.credit.confirm")}>{tk("admin.samples.credit")}</button>
      {msg && <span className="text-ink-2">{msg}</span>}
    </div>
  );
}
