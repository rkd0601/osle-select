import Link from "next/link";

/**
 * 필터 탭 (UI 키트). URL 쿼리로 동작하는 링크 탭 — 새로고침·공유해도 같은 화면, JS 없이 동작.
 * variant "tabs" = 밑줄 탭(화면 상단 구분), "chips" = 둥근 칩(보조 필터). 건수(count)는 SUIT 숫자.
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
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = t.key === active;
        const dot = t.tone === "warn" ? "bg-warn" : t.tone === "brand" ? "bg-signature" : "";
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-body transition-colors ${on ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink"}`}>
            {t.label}
            {t.count != null && (
              <span className={`num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-caption ${on ? "bg-ink text-paper" : "bg-sand text-ink-2"}`}>{t.count}</span>
            )}
            {dot && t.count ? <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden /> : null}
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
