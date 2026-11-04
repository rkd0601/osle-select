/**
 * 원문/번역 병기 (공통 컴포넌트 7/8). 관리자·CN 화면 전용 — 브랜드 화면에는 쓰지 않는다(중국어 원문 비노출).
 * 디자인 v2: 상자 없이 위아래 1px 룰 사이 두 칸(모바일은 위아래), 칸 사이 1px 세로 룰. 라벨 12 muted.
 * 5단계에서 역번역 불확실 구간 하이라이트(highlights)를 받는다.
 */
export function Bilingual({ ko, zh, labelKo = "KO", labelZh = "中文", missing = "-" }: { ko: string | null; zh: string | null; labelKo?: string; labelZh?: string; missing?: string }) {
  return (
    <div className="grid border-y border-line md:grid-cols-2">
      <div className="py-4 md:pr-6">
        <div className="eyebrow">{labelKo}</div>
        <p className="mt-2 whitespace-pre-wrap text-body text-ink">{ko || missing}</p>
      </div>
      <div className="border-t border-line py-4 md:border-l md:border-t-0 md:pl-6" lang="zh-CN">
        <div className="eyebrow">{labelZh}</div>
        <p className={`mt-2 whitespace-pre-wrap text-body ${zh ? "text-ink" : "text-warn"}`}>{zh || missing}</p>
      </div>
    </div>
  );
}
