"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { addComment } from "@/lib/actions/comments";
import type { CommentTarget, Visibility } from "@/lib/comments";
import type { CommentRow } from "@/lib/db/comments";

/**
 * 통합 코멘트 스레드 (디자인 v2 §4 코멘트). 가시성 탭(관리자: 브랜드·내부·중국 담당), 원문/번역 병기는 cn 가시성만.
 * 행은 1px 룰 사이(말풍선·상자 없음), 입력은 밑줄 하나 + "보내기" 텍스트 버튼(`.comment`).
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
  const send = () =>
    start(async () => {
      setMsg(null);
      const r = await addComment({ targetType: props.targetType, targetId: props.targetId, visibility: tab, body });
      if (!r.ok) return setMsg(t(L, r.error));
      setBody("");
      router.refresh();
    });
  return (
    <section>
      <div className="section-h" style={{ borderBottom: 0, paddingBottom: 16 }}>
        <h2>{t(L, "comments.title")}</h2>
        {props.tabs.length > 1 && (
          <div className="flex gap-4">
            {props.tabs.map((v) => (
              <button key={v} type="button" aria-pressed={tab === v}
                className={`min-h-9 border-b text-meta ${tab === v ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`} onClick={() => setTab(v)}>
                {t(L, `comments.tab.${v}`)} <span className="num text-muted">{props.rows.filter((r) => r.visibility === v).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mb-5 text-meta text-ink-2">{t(L, "comments.empty")}</p>
      ) : (
        <ol className="mb-5 border-t border-line">
          {rows.map((r) => {
            const main = L === "zh-CN" ? (r.zh ?? r.ko) : (r.ko ?? r.zh);
            const orig = tab === "cn" ? (L === "zh-CN" ? r.ko : r.zh) : null;
            return (
              <li key={r.id} className="border-b border-line py-3 text-body">
                <div className="flex items-baseline gap-2 text-caption text-muted">
                  <span className={r.who === "me" ? "font-medium text-ink" : ""}>{whoLabel(r)}</span>
                  <span className="num">{fmtDate(r.at, L, true)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap" lang={L === "zh-CN" && r.zh ? "zh-CN" : undefined}>{main}</p>
                {tab === "cn" && (orig ? <p className="mt-1 whitespace-pre-wrap text-meta text-ink-2" lang={L === "zh-CN" ? undefined : "zh-CN"}>{orig}</p> : <p className="mt-1 text-caption text-warn">{t(L, "comments.untranslated")}</p>)}
              </li>
            );
          })}
        </ol>
      )}
      <div className="comment">
        <textarea aria-label={t(L, ph)} rows={1} maxLength={2000} placeholder={t(L, ph)} value={body} onChange={(e) => setBody(e.target.value)}
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent py-2 text-body outline-none [field-sizing:content] placeholder:text-muted" />
        <button type="button" className="min-h-10 px-1 disabled:opacity-35" disabled={pending || !body.trim()} onClick={send}>{t(L, "comments.post")}</button>
      </div>
      {msg && <p className="mt-2 text-meta text-crit">{msg}</p>}
    </section>
  );
}
