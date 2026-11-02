"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { Bilingual } from "@/components/domain/bilingual";
import { answerCnQuestionAdmin, editCnQuestion, holdCnQuestion, releaseCnQuestion } from "../cn-question-actions";

/** A-02 CN 질문 게이트 한 건: 노출 전에는 보류·문구 수정·바로 노출·직접 답변, 노출 뒤에는 상태만 */
export type GateQuestion = {
  id: string; body_zh: string; body_ko: string | null; options: { zh: string; ko: string | null }[];
  admin_gate_until: string; released_at: string | null; held_by_admin: boolean; answer: string | null; answered_at: string | null;
};
const ghost = "border border-line px-3 py-1.5 text-[12px] disabled:opacity-40";

export function CnQuestionGate({ q }: { q: GateQuestion }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ko, setKo] = useState(q.body_ko ?? "");
  const [opts, setOpts] = useState(q.options.map((o) => o.ko ?? ""));
  const [answer, setAnswer] = useState("");
  const open = !q.released_at && !q.answered_at;
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg(tk(r.error));
      else router.refresh();
    });
  return (
    <div className="space-y-2 text-[13px]">
      <Bilingual ko={q.body_ko} zh={q.body_zh} />
      {q.options.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-[12px]">
          {q.options.map((o, i) => <li key={i} className="border border-line px-2 py-0.5"><span lang="zh-CN">{o.zh}</span> · {o.ko ?? "-"}</li>)}
        </ul>
      )}
      <p className="num text-[11px] text-muted">
        {q.answered_at ? tk("cnq.answered", { a: q.answer ?? "" }) : q.released_at ? tk("cnq.released", { date: fmtDate(q.released_at, "ko", true) }) : q.held_by_admin ? tk("cnq.held") : tk("cnq.gateUntil", { date: fmtDate(q.admin_gate_until, "ko", true) })}
      </p>
      {open && (
        <div className="space-y-2 border-l-2 border-ink pl-3">
          <textarea className="w-full border border-line bg-paper p-2" rows={2} maxLength={500} value={ko} onChange={(e) => setKo(e.target.value)} />
          {opts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {opts.map((o, i) => (
                <input key={i} className="w-32 border-0 border-b border-line bg-transparent py-1 outline-none" maxLength={60} value={o}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
            </div>
          )}
          {!q.body_ko && <p className="text-[11px] text-warn">{tk("cnq.noKo")}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={ghost} disabled={pending || !ko.trim() || opts.some((o) => !o.trim())} onClick={() => run(() => editCnQuestion(q.id, { bodyKo: ko, optionsKo: opts }))}>{tk("cnq.edit")}</button>
            <button className={ghost} disabled={pending} onClick={() => run(() => holdCnQuestion(q.id, !q.held_by_admin))}>{tk(q.held_by_admin ? "cnq.unhold" : "cnq.hold")}</button>
            <button className="bg-ink px-3 py-1.5 text-[12px] font-medium text-paper disabled:opacity-40" disabled={pending || !q.body_ko} onClick={() => run(() => releaseCnQuestion(q.id))}>{tk("cnq.release")}</button>
          </div>
        </div>
      )}
      {!q.answered_at && (
        <div className="flex gap-2">
          <input className="flex-1 border-0 border-b border-line bg-transparent py-1.5 outline-none" maxLength={500} placeholder={tk("cnq.adminAnswer")} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <button className={ghost} disabled={pending || !answer.trim()} onClick={() => run(() => answerCnQuestionAdmin(q.id, { answer }))}>{tk("cnq.answer")}</button>
        </div>
      )}
      {msg && <p className="text-[12px] text-crit">{msg}</p>}
    </div>
  );
}
