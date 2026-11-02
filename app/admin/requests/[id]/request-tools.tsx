"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { addRequestItem, moveRequestImage, suggestTranslation, updateRequestMemoZh } from "../actions";

const input = "w-full border border-line bg-surface px-2 py-1.5 text-body outline-none focus:border-ink";

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
      <textarea className={`${input} min-h-16`} aria-label={tk("a11y.memoZh")} value={v} maxLength={4000} onChange={(e) => setV(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="text-meta text-signature" disabled={pending || !memo} onClick={() => start(async () => {
          const res = await suggestTranslation(memo, "request_memo");
          if (res.ok) setV(res.data);
          else setMsg(tk(res.error));
        })}>{tk("admin.request.translate")}</button>
        <button className="bg-ink px-3 py-1 text-meta text-paper disabled:opacity-40" disabled={pending} onClick={() => run(() => updateRequestMemoZh(requestId, v))}>{tk("common.save")}</button>
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
    <div className="flex items-center gap-2">
      <input aria-label={tk("request.field.description.ph")} className={`${input} max-w-md`} placeholder={tk("request.field.description.ph")} value={d} maxLength={200} onChange={(e) => setD(e.target.value)} />
      <button className="border border-ink px-3 py-1.5 text-meta disabled:opacity-40" disabled={pending || !d.trim()} onClick={() => run(() => addRequestItem(requestId, { description: d }))}>
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
      className="mt-1 w-full border border-line bg-surface text-caption"
      aria-label={tk("admin.request.moveImage")}
      disabled={pending}
      value=""
      onChange={(e) => e.target.value && run(() => moveRequestImage(imageId, e.target.value))}
    >
      <option value="">→ {tk("admin.request.moveImage")}</option>
      {options.map((t) => <option key={t.id} value={t.id}>#{t.seq}</option>)}
    </select>
  );
}
