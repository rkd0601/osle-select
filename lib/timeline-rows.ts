import type { TimelineRow } from "@/components/domain/timeline";
import { kstDay } from "@/lib/offers";

/**
 * 진행 기록의 메시지는 본문 없이 **날짜별 "메시지 n건"** 한 줄로 접는다 (DECISIONS u-11). 본문은 코멘트 칸에서만 — 같은 글이 두 번 보이지 않게.
 * 시각은 그날 마지막 메시지(정렬 위치).
 */
export function commentSummaryRows(comments: { created_at: string }[], label: (n: number) => string): TimelineRow[] {
  const byDay = new Map<string, { n: number; last: string }>();
  for (const c of comments) {
    const d = kstDay(new Date(c.created_at));
    const cur = byDay.get(d);
    byDay.set(d, { n: (cur?.n ?? 0) + 1, last: !cur || c.created_at > cur.last ? c.created_at : cur.last });
  }
  return [...byDay.values()].map((v) => ({ at: v.last, label: label(v.n) }));
}
