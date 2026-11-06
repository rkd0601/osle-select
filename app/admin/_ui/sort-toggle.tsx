import Link from "next/link";
import { tk } from "@/lib/i18n/admin";
import type { SortMode } from "@/lib/admin-recency";

/**
 * 관리자 목록 정렬 토글 "최근 · 기한" (§0-l P1·P2, d-29). 서버 렌더 링크(`?sort=due`) — 클라이언트 JS 없음.
 * 탭 줄 오른쪽 끝에 두고 아래 룰을 이어 그린다(탭 nav와 같은 border-b · py-3).
 */
export function SortToggle({ active, hrefFor, ruled = true }: { active: SortMode; hrefFor: (m: SortMode) => string; ruled?: boolean }) {
  const modes: SortMode[] = ["recent", "due"];
  return (
    <nav aria-label={tk("admin.todo.sort.label")} className={`flex shrink-0 items-baseline gap-2 whitespace-nowrap py-3 text-meta ${ruled ? "border-b border-line" : ""}`}>
      <span className="text-muted">{tk("admin.todo.sort.label")}</span>
      {modes.map((m, i) => (
        <span key={m} className="flex items-baseline gap-2">
          {i > 0 && <span className="text-muted" aria-hidden>·</span>}
          <Link href={hrefFor(m)} aria-current={m === active ? "true" : undefined}
            className={m === active ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}>
            {tk(`admin.todo.sort.${m}`)}
          </Link>
        </span>
      ))}
    </nav>
  );
}
