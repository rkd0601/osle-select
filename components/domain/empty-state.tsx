import Link from "next/link";

/** 빈 상태 (UI 키트). "없음" 한 줄 대신 — 무엇이 여기 생기는지 + 다음 행동 하나. 필터 결과가 비었을 때는 초기화 링크. */
export function EmptyState({ title, help, action, compact = false }: { title: string; help?: string; action?: { href: string; label: string }; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-ui border border-dashed border-line-strong text-center ${compact ? "px-4 py-8" : "px-6 py-16"}`}>
      <svg aria-hidden viewBox="0 0 48 48" className="h-10 w-10 text-line-strong" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="9" y="6" width="30" height="36" rx="2" /><path d="M16 16h16M16 23h16M16 30h9" strokeLinecap="round" />
      </svg>
      <p className="mt-3 text-lead font-semibold text-ink">{title}</p>
      {help && <p className="mt-1 max-w-sm text-body text-ink-2">{help}</p>}
      {action && <Link href={action.href} className="btn btn-primary mt-4">{action.label}</Link>}
    </div>
  );
}
