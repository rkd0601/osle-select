"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { addTerm, approveTerm, deleteTerm, updateTerm } from "./actions";

type R = { ok: true; data?: unknown } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<R>, onOk?: () => void) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok) return setMsg(tk(r.error));
    onOk?.();
    router.refresh();
  });
  return { pending, msg, run };
}
const field = "border-0 border-b border-line bg-transparent py-1 text-body outline-none";
const btn = "btn btn-primary btn-sm";

export function AddTermForm() {
  const { pending, msg, run } = useRun();
  const [t, setT] = useState({ zh: "", ko: "", category: "" });
  return (
    <div className="flex flex-wrap items-center gap-3 text-body">
      <input className={`${field} w-40`} lang="zh-CN" placeholder={tk("glossary.zh")} value={t.zh} onChange={(e) => setT({ ...t, zh: e.target.value })} aria-label={tk("glossary.zh")} />
      <input className={`${field} w-40`} placeholder={tk("glossary.ko")} value={t.ko} onChange={(e) => setT({ ...t, ko: e.target.value })} aria-label={tk("glossary.ko")} />
      <input className={`${field} w-28`} placeholder={tk("glossary.category")} value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} aria-label={tk("glossary.category")} />
      <button className={btn} disabled={pending || !t.zh.trim() || !t.ko.trim()} onClick={() => run(() => addTerm(t), () => setT({ zh: "", ko: "", category: "" }))}>{tk("glossary.add")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

export function TermRow({ term }: { term: { id: string; term_zh: string; term_ko: string; category: string | null; approved: boolean } }) {
  const { pending, msg, run } = useRun();
  const [edit, setEdit] = useState(false);
  const [t, setT] = useState({ zh: term.term_zh, ko: term.term_ko, category: term.category ?? "" });
  return (
    <li className="flex flex-wrap items-center gap-3 py-2 text-body">
      {edit ? (
        <>
          <input className={`${field} w-40`} lang="zh-CN" value={t.zh} onChange={(e) => setT({ ...t, zh: e.target.value })} aria-label={tk("glossary.zh")} />
          <input className={`${field} w-40`} value={t.ko} onChange={(e) => setT({ ...t, ko: e.target.value })} aria-label={tk("glossary.ko")} />
          <input className={`${field} w-28`} value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} aria-label={tk("glossary.category")} />
          <button className={btn} disabled={pending || !t.zh.trim() || !t.ko.trim()} onClick={() => run(() => updateTerm(term.id, t), () => setEdit(false))}>{tk("common.save")}</button>
          <button className="text-meta text-muted" onClick={() => setEdit(false)}>{tk("common.cancel")}</button>
        </>
      ) : (
        <>
          <span className="w-40" lang="zh-CN">{term.term_zh}</span>
          <span className="w-40">{term.term_ko}</span>
          <span className="w-28 text-meta text-muted">{term.category ?? ""}</span>
          {!term.approved && <button className={btn} disabled={pending} onClick={() => run(() => approveTerm(term.id, true))}>{tk("glossary.approve")}</button>}
          <button className="text-meta text-ink-2 underline-offset-4 hover:underline" onClick={() => setEdit(true)}>{tk("glossary.edit")}</button>
          {term.approved && <button className="text-meta text-muted" disabled={pending} onClick={() => run(() => approveTerm(term.id, false))}>{tk("glossary.unapprove")}</button>}
          <button className="text-meta text-crit" disabled={pending} onClick={() => window.confirm(tk("glossary.deleteAsk")) && run(() => deleteTerm(term.id))}>{tk("glossary.delete")}</button>
        </>
      )}
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </li>
  );
}
