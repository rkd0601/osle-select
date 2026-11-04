import Link from "next/link";

/**
 * 숫자 카드 (UI 키트). 라벨 + 큰 SUIT 숫자 + 보조 문구. href가 있으면 눌러서 그 목록으로(대시보드·홈 요약).
 * tone: brand = 내 차례·좋은 신호, warn = 확인 필요, crit = 지연.
 */
export type StatItem = { label: string; value: string | number; hint?: string; href?: string; tone?: "default" | "brand" | "warn" | "crit" };

const TONE = { default: "text-ink", brand: "text-signature", warn: "text-warn", crit: "text-crit" } as const;

export function StatGrid({ items, columns = 4 }: { items: StatItem[]; columns?: 2 | 3 | 4 | 5 }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }[columns];
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line ${cols}`}>
      {items.map((s) => {
        const body = (
          <>
            <div className="text-meta text-ink-2">{s.label}</div>
            <div className={`num mt-2 text-title font-semibold leading-none ${TONE[s.tone ?? "default"]}`}>{s.value}</div>
            {s.hint && <div className="mt-2 text-caption text-muted">{s.hint}</div>}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="group block bg-surface px-5 py-4 transition-colors hover:bg-paper">
            {body}
            <span className="mt-2 block text-caption text-muted group-hover:text-ink" aria-hidden>→</span>
          </Link>
        ) : (
          <div key={s.label} className="bg-surface px-5 py-4">{body}</div>
        );
      })}
    </div>
  );
}
