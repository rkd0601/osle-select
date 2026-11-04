import Link from "next/link";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";

/**
 * 관리자 화면 공용 조각 (서버 컴포넌트용). UI 키트(components/domain/*) 위에 관리자 목록·상세의 반복 구조만 얹는다.
 * 문구는 전부 i18n 키(규칙 10). 상태·금액 로직은 없다 — 표시만.
 */

export type SearchParams = Record<string, string | string[] | undefined>;
export const sp = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/** 검색어가 필드 중 하나에 들어 있나 (대소문자 무시, 빈 검색어 = 통과) */
export function matchQ(q: string | undefined, ...fields: (string | number | null | undefined)[]) {
  const n = (q ?? "").trim().toLowerCase();
  if (!n) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(n));
}

/** 행 목록에서 브랜드 선택지(이름순, 중복 제거) */
export function brandOptions(rows: { slug?: string | null; name?: string | null }[]) {
  const m = new Map<string, string>();
  for (const r of rows) if (r.slug && r.name) m.set(r.slug, r.name);
  return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

/** 목록 위 도구 줄(탭 아래 검색·필터) */
export function Toolbar({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{children}</div>
      {end && <div className="flex items-center gap-2">{end}</div>}
    </div>
  );
}

/** 빈 목록 — 아직 없음 / 필터 결과 없음(초기화 링크)을 구분한다 */
export function ListEmpty({ filtered, resetHref, title, help }: { filtered: boolean; resetHref: string; title: string; help?: string }) {
  return filtered
    ? <EmptyState title={tk("admin.ui.filtered.title")} help={tk("admin.ui.filtered.help")} action={{ href: resetHref, label: tk("admin.ui.filtered.reset") }} />
    : <EmptyState title={title} help={help} />;
}

/** 기한 셀: SUIT 숫자, 지나면 crit + "지연" 표시 */
export function Due({ at, now, withTime = true }: { at: string | null | undefined; now: Date; withTime?: boolean }) {
  if (!at) return <span className="num text-muted">-</span>;
  const late = isOverdue(at, now);
  return (
    <span className={`num whitespace-nowrap ${late ? "font-semibold text-crit" : "text-ink-2"}`}>
      {fmtDate(at, "ko", withTime)}
      {late && <span className="ml-1.5 rounded-full bg-crit-soft px-1.5 py-px align-middle text-micro font-semibold">{tk("admin.ui.overdue")}</span>}
    </span>
  );
}

/** 지연 행 표시(첫 칸 왼쪽 2px crit 룰) — <tr className={lateRow(...)}> */
export const lateRow = (late: boolean) => (late ? "[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-crit)]" : "");

/** 상세 화면 블록: eyebrow 머리 + 카드 본문 */
export function Section({ title, count, actions, children, flush = false, tone, className = "", id }: {
  title: string; count?: number | string | null; actions?: React.ReactNode; children: React.ReactNode; flush?: boolean; tone?: "warn" | "brand"; className?: string; id?: string;
}) {
  const ring = tone === "warn" ? "border-warn" : tone === "brand" ? "border-signature" : "";
  return (
    <section id={id} className={`card ${ring} ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="eyebrow">
          {title}
          {count != null && <span className="num ml-1.5 text-ink">{count}</span>}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={flush ? "" : "card-pad"}>{children}</div>
    </section>
  );
}

/** 상세 2단: 본문 + 오른쪽 고정(sticky) 보조 칸(돈·다음 행동). 좁은 화면(<1280)에서는 보조 칸이 위로 올라온다 */
export function DetailLayout({ main, aside, asideWidth = "340px" }: { main: React.ReactNode; aside: React.ReactNode; asideWidth?: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_var(--aside)]" style={{ "--aside": asideWidth } as React.CSSProperties}>
      <div className="order-2 min-w-0 space-y-6 xl:order-1">{main}</div>
      <aside className="order-1 space-y-4 xl:order-2 xl:sticky xl:top-8 xl:self-start">{aside}</aside>
    </div>
  );
}

/** 목록으로 돌아가기 */
export function BackLink({ href, label }: { href: string; label?: string }) {
  return <Link href={href} className="mb-3 inline-flex items-center gap-1 text-meta text-ink-2 hover:text-ink">{label ?? tk("common.back")}</Link>;
}

/** 라벨-값 목록 (2열) */
export function Facts({ rows, cols = 1 }: { rows: [string, React.ReactNode][]; cols?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-6 ${cols === 2 ? "sm:grid-cols-2" : ""}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-body last:border-b-0">
          <dt className="shrink-0 text-meta text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}
