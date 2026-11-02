"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { answerCnQuestion } from "../actions";

/** 중국 담당자 질문(한국어) — 선택지 하나 고르거나 직접 적어 1회 답한다 */
export function CnQuestionAnswer({ brandId, q }: { brandId: string; q: { id: string; body_ko: string | null; options_ko: (string | null)[]; answer: string | null; answered_at: string | null } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [option, setOption] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2 border-l-2 border-signature bg-surface px-4 py-3 text-body">
      <p className="font-medium">{q.body_ko}</p>
      {q.answered_at ? (
        <p className="text-ink-2">{tk("cnq.answered", { a: q.answer ?? "" })}</p>
      ) : (
        <>
          {q.options_ko.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {q.options_ko.map((o, i) => (
                <button key={i} type="button" className={`border px-3 py-1 ${option === i ? "border-ink bg-ink text-paper" : "border-line"}`} onClick={() => setOption(option === i ? null : i)}>{o ?? "-"}</button>
              ))}
            </div>
          )}
          <input className="w-full border-0 border-b border-line bg-transparent py-1.5 outline-none" maxLength={500} placeholder={tk("cnq.freeText")} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="bg-ink px-4 py-2 text-body font-medium text-paper disabled:opacity-40" disabled={pending || (option == null && !text.trim())}
            onClick={() => start(async () => {
              setMsg(null);
              const r = await answerCnQuestion(brandId, q.id, { option, text });
              if (!r.ok) setMsg(tk(r.error));
              else router.refresh();
            })}>{tk("cnq.answer")}</button>
          {msg && <p className="text-meta text-crit">{msg}</p>}
        </>
      )}
    </div>
  );
}
