"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { addComment } from "@/lib/actions/comments";
import type { CommentTarget, Visibility } from "@/lib/comments";
import type { CommentRow } from "@/lib/db/comments";

/**
 * 통합 코멘트 스레드 (공통 컴포넌트, 8단계). 가시성 탭(관리자: 브랜드·내부·중국 담당), 원문/번역 병기는 cn 가시성만.
 * 브랜드 화면에는 brand 탭 하나만 넘긴다 — 행에도 zh가 없다(lib/db/comments#brandThread).
 */
export function CommentThread(props: {
  targetType: CommentTarget; targetId: string; viewer: "brand" | "admin" | "cn"; tabs: Visibility[]; rows: CommentRow[]; locale?: Locale;
}) {
  const L = props.locale ?? (props.viewer === "cn" ? "zh-CN" : "ko");
  const router = useRouter();
  const [tab, setTab] = useState<Visibility>(props.tabs[0]);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rows = props.rows.filter((r) => r.visibility === tab);
  const ph = props.viewer === "admin" ? `comments.ph.admin.${tab}` : props.viewer === "cn" ? "comments.ph.cn" : "comments.ph.brand";
  const whoLabel = (r: CommentRow) =>
    r.who === "me" ? t(L, "comments.me") : props.viewer === "admin" ? (r.name ?? t(L, "comments.weare")) : r.who === "brand" ? (r.name ?? "") : t(L, "comments.weare");
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t(L, "comments.title")}</h2>
        {props.tabs.length > 1 && props.tabs.map((v) => (
          <button key={v} className={`text-[12px] ${tab === v ? "font-semibold text-ink underline underline-offset-4" : "text-muted"}`} onClick={() => setTab(v)}>
            {t(L, `comments.tab.${v}`)} <span className="num">{props.rows.filter((r) => r.visibility === v).length}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">{t(L, "comments.empty")}</p>
      ) : (
        <ol className="space-y-3 border-l border-line pl-3">
          {rows.map((r) => {
            const main = L === "zh-CN" ? (r.zh ?? r.ko) : (r.ko ?? r.zh);
            const orig = tab === "cn" ? (L === "zh-CN" ? r.ko : r.zh) : null;
            return (
              <li key={r.id} className="text-[13px]">
                <div className="flex items-baseline gap-2 text-[11px] text-muted">
                  <span className={r.who === "me" ? "font-semibold text-ink" : ""}>{whoLabel(r)}</span>
                  <span className="num">{fmtDate(r.at, L, true)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap" lang={L === "zh-CN" && r.zh ? "zh-CN" : undefined}>{main}</p>
                {tab === "cn" && (orig ? <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-ink-2" lang={L === "zh-CN" ? undefined : "zh-CN"}>{orig}</p> : <p className="mt-0.5 text-[11px] text-warn">{t(L, "comments.untranslated")}</p>)}
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex items-end gap-2">
        <textarea className="min-h-[40px] flex-1 border-0 border-b border-line bg-transparent py-1.5 text-[13px] outline-none" rows={1} maxLength={2000}
          placeholder={t(L, ph)} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="bg-ink px-3 py-1.5 text-[12px] font-medium text-paper disabled:opacity-40" disabled={pending || !body.trim()}
          onClick={() => start(async () => {
            setMsg(null);
            const r = await addComment({ targetType: props.targetType, targetId: props.targetId, visibility: tab, body });
            if (!r.ok) return setMsg(t(L, r.error));
            setBody("");
            router.refresh();
          })}>{t(L, "comments.post")}</button>
      </div>
      {msg && <p className="text-[12px] text-crit">{msg}</p>}
    </section>
  );
}
