"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { addRequestItem, intakeAllItems, moveRequestImage, suggestTranslation, updateRequestMemoZh } from "../actions";

const input = "field";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(tk(res.ok ? "common.saved" : res.error));
      if (res.ok) router.refresh();
    });
  return { pending, msg, run, start, setMsg };
}

/** 요청 메모 중국어 (CN 화면의 需求备注) */
export function MemoZhEditor({ requestId, memo, memoZh }: { requestId: string; memo: string; memoZh: string }) {
  const [v, setV] = useState(memoZh);
  const { pending, msg, run, start, setMsg } = useRun();
  return (
    <div className="space-y-2" lang="zh-CN">
      <textarea className={input} aria-label={tk("a11y.memoZh")} value={v} maxLength={4000} onChange={(e) => setV(e.target.value)} />
      <div className="flex items-center gap-4">
        <button className="text-meta text-ink-2 underline underline-offset-4 hover:text-ink" disabled={pending || !memo} onClick={() => start(async () => {
          const res = await suggestTranslation(memo, "request_memo");
          if (res.ok) setV(res.data);
          else setMsg(tk(res.error));
        })}>{tk("admin.request.translate")}</button>
        <button className="btn sm" disabled={pending} onClick={() => run(() => updateRequestMemoZh(requestId, v))}>{tk("common.save")}</button>
        {msg && <span className="text-meta text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}

/** 항목 분리: 새 항목 추가 */
export function AddItemForm({ requestId }: { requestId: string }) {
  const [d, setD] = useState("");
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <input aria-label={tk("request.field.description.ph")} className={`${input} max-w-md`} placeholder={tk("request.field.description.ph")} value={d} maxLength={200} onChange={(e) => setD(e.target.value)} />
      <button className="btn sec sm" disabled={pending || !d.trim()} onClick={() => run(() => addRequestItem(requestId, { description: d }))}>
        {tk("admin.request.split")}
      </button>
      {msg && <span className="text-meta text-ink-2">{msg}</span>}
    </div>
  );
}

/** 이미지를 다른 항목으로 옮기기 */
export function MoveImage({ imageId, current, targets }: { imageId: string; current: string | null; targets: { id: string; seq: number }[] }) {
  const { pending, run } = useRun();
  const options = targets.filter((t) => t.id !== current);
  if (!options.length) return null;
  return (
    <select
      className="mt-1.5 w-full border-0 border-b border-line bg-transparent py-1 text-caption text-ink-2"
      aria-label={tk("admin.request.moveImage")}
      disabled={pending}
      value=""
      onChange={(e) => e.target.value && run(() => moveRequestImage(imageId, e.target.value))}
    >
      <option value="">{tk("admin.request.moveImage")}</option>
      {options.map((t) => <option key={t.id} value={t.id}>#{t.seq}</option>)}
    </select>
  );
}

/**
 * A1 접수 한 번에 (NEXT §0-g): 접수 항목 전부 번역 초안 + 첫 소싱 담당 배정. 서버가 대상·담당·기한을 다시 정한다(help는 미리보기).
 * 번역이 안 되면(키 없음) 항목별 초안 버튼과 같은 문구로 알리고, 중국어 설명이 있는 항목만 배정된다.
 */
export function IntakeAllButton({ requestId, help }: { requestId: string; help: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<string[]>([]);
  return (
    <div className="flex flex-col items-end gap-1.5 text-right">
      <button className="btn sm" disabled={pending} onClick={() => start(async () => {
        setLines([]);
        const r = await intakeAllItems(requestId);
        if (!r.ok) return setLines([tk(r.error)]);
        const d = r.data;
        setLines([
          tk("admin.request.intake.done", { assigned: d.assigned, translated: d.translated }),
          ...(d.needZh ? [tk("admin.request.intake.needZh", { n: d.needZh, reason: tk(d.translateError ?? "request.error.needZh") })] : []),
          ...(d.failed ? [tk("admin.request.intake.failed", { n: d.failed })] : []),
        ]);
        router.refresh();
      })}>{tk("admin.request.intake")}</button>
      <span className="text-caption text-muted">{help}</span>
      {lines.map((l) => <span key={l} role="status" className="text-meta text-ink-2">{l}</span>)}
    </div>
  );
}
