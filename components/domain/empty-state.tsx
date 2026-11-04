import Link from "next/link";

/**
 * 빈 상태 `.empty` (디자인 v2 §4) — 세로 80px 여백, 한 문장(16 ink) + 버튼 하나. 두 번째 설명 문장은 쓰지 않는다(help는 무시 — 이전 호출 호환).
 */
export function EmptyState({ title, action, compact = false }: { title: string; help?: string; action?: { href: string; label: string }; compact?: boolean }) {
  return (
    <div className="empty" style={compact ? { padding: "40px 0" } : undefined}>
      <p className="t">{title}</p>
      {action && <Link href={action.href} className="btn sec">{action.label}</Link>}
    </div>
  );
}
