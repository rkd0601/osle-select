/**
 * 원문/번역 병기 (공통 컴포넌트 7/8). 관리자·CN 화면 전용 — 브랜드 화면에는 쓰지 않는다(중국어 원문 비노출).
 * 5단계에서 역번역 불확실 구간 하이라이트(highlights)를 받는다.
 */
export function Bilingual({ ko, zh, labelKo = "KO", labelZh = "中文", missing = "-" }: { ko: string | null; zh: string | null; labelKo?: string; labelZh?: string; missing?: string }) {
  return (
    <div className="grid gap-px bg-line md:grid-cols-2">
      <div className="bg-surface p-3">
        <div className="text-micro font-semibold tracking-wide text-muted">{labelKo}</div>
        <p className="mt-1 whitespace-pre-wrap text-body">{ko || missing}</p>
      </div>
      <div className="bg-surface p-3" lang="zh-CN">
        <div className="text-micro font-semibold tracking-wide text-muted">{labelZh}</div>
        <p className={`mt-1 whitespace-pre-wrap text-body ${zh ? "" : "text-warn"}`}>{zh || missing}</p>
      </div>
    </div>
  );
}
