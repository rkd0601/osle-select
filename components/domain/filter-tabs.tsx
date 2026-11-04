import Link from "next/link";

/**
 * 필터 탭 (디자인 v2) — URL 쿼리 링크 탭. "tabs" = 1px 밑줄(활성 ink), 건수는 muted 숫자만(뱃지 배경 없음).
 * "chips" = 누르는 칩(32px, 선택 ink 채움) — 보조 필터에만.
 */
export type FilterTab = { key: string; label: string; href: string; count?: number | null; tone?: "default" | "warn" | "brand" };

export function FilterTabs({ tabs, active, variant = "tabs", label }: { tabs: FilterTab[]; active: string; variant?: "tabs" | "chips"; label?: string }) {
  if (variant === "chips") {
    return (
      <nav aria-label={label} className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className="chip" aria-current={t.key === active ? "true" : undefined}>
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="flex gap-7 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-baseline gap-1.5 whitespace-nowrap border-b py-3 text-body transition-colors ${on ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {t.label}
            {t.count != null && <span className={`num text-meta ${t.tone === "warn" && t.count ? "text-warn" : "text-muted"}`}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** 쿼리스트링 조립 — 기존 파라미터를 유지하고 일부만 바꾼다(빈 값은 지운다) */
export function withQuery(base: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
