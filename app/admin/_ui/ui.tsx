import Link from "next/link";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { isE2EName } from "@/lib/e2e";

/**
 * 관리자 화면 공용 조각 (서버 컴포넌트용, 디자인 v2 "표·룰만 교체"). 상자 대신 1px 룰 섹션·`.tbl` 표.
 * 문구는 전부 i18n 키(규칙 10). 상태·금액 로직은 없다 — 표시만.
 */

export type SearchParams = Record<string, string | string[] | undefined>;
export const sp = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/** 관리자 표 `.tbl` — 열 사이 간격만 더한다(전역 .tbl은 좌우 패딩 0). 숫자 열은 th/td에 `r` */
export const TBL = "tbl [&_th]:pr-5 [&_td]:pr-5 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0";

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
  return [...m].map(([value, label]) => ({ value, label }))
    .sort((a, b) => Number(isE2EName(a.label)) - Number(isE2EName(b.label)) || a.label.localeCompare(b.label, "ko")); // E2E 이름은 맨 뒤 (d-23)
}

/** 목록 위 도구 줄(탭 아래 검색·필터) */
export function Toolbar({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-3">{children}</div>
      {end && <div className="flex items-center gap-2">{end}</div>}
    </div>
  );
}

/** 빈 목록 — 아직 없음 / 필터 결과 없음(초기화 링크)을 구분한다 */
export function ListEmpty({ filtered, resetHref, title }: { filtered: boolean; resetHref: string; title: string; help?: string }) {
  return filtered
    ? <EmptyState title={tk("admin.ui.filtered.title")} action={{ href: resetHref, label: tk("admin.ui.filtered.reset") }} />
    : <EmptyState title={title} />;
}

/** 기한: SUIT 13 muted, 지나면 crit 500 (색만으로 알리지 않게 화면 낭독용 "지연") */
export function Due({ at, now, withTime = true }: { at: string | null | undefined; now: Date; withTime?: boolean }) {
  if (!at) return <span className="num text-meta text-muted">-</span>;
  const late = isOverdue(at, now);
  return (
    <span className={`num whitespace-nowrap text-meta ${late ? "font-medium text-crit" : "text-muted"}`}>
      {fmtDate(at, "ko", withTime)}
      {late && <span className="sr-only"> {tk("admin.ui.overdue")}</span>}
    </span>
  );
}

/** 룰 섹션 `.section` + `.section-h`(제목 16/500 + 건수 muted, 아래 1px 룰). 상자 없음. tone=warn이면 머리 룰만 warn */
export function Section({ title, count, actions, children, tone, className = "", id }: {
  title: string; count?: number | string | null; actions?: React.ReactNode; children: React.ReactNode; flush?: boolean; tone?: "warn" | "brand"; className?: string; id?: string;
}) {
  return (
    <section id={id} className={`section first:pt-0 [header+&]:pt-4 ${className}`}>
      <header className={`section-h ${tone === "warn" ? "border-b-warn" : ""}`}>
        <h2>
          {title}
          {count != null && <span className="count num">{count}</span>}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </header>
      <div className="pt-5">{children}</div>
    </section>
  );
}

/**
 * 상세 2단 — 관리자 본문 12칸(칸 56 · 간격 24, 1280 화면에서 x 280–1217, NEXT §0-h L12): 본문 8칸 + 오른쪽 4칸(sticky 24).
 * 1200px 미만(사이드바 232 때문에 칸이 너무 좁아짐)은 한 칸으로 쌓는다. 보조 칸이 돈·다음 행동이면 위로(asideFirst), 기록·코멘트면 아래로.
 */
export function DetailLayout({ main, aside, asideFirst = true }: { main: React.ReactNode; aside: React.ReactNode; asideWidth?: string; asideFirst?: boolean }) {
  return (
    <div className="grid grid-cols-12 items-start gap-x-6 gap-y-12">
      <div className={`col-span-12 min-w-0 min-[1200px]:order-1 min-[1200px]:col-span-8 ${asideFirst ? "order-2" : "order-1"}`}>{main}</div>
      <aside className={`col-span-12 min-w-0 min-[1200px]:sticky min-[1200px]:top-6 min-[1200px]:order-2 min-[1200px]:col-span-4 ${asideFirst ? "order-1" : "order-2"}`}>{aside}</aside>
    </div>
  );
}

/** 목록으로 돌아가기 (텍스트 링크, 화살표 없음) */
export function BackLink({ href, label }: { href: string; label?: string }) {
  return <Link href={href} className="link mb-6 inline-block">{label ?? tk("admin.ui.back")}</Link>;
}

/** 라벨-값 목록 — 1px 룰 사이 행 */
export function Facts({ rows, cols = 1 }: { rows: [string, React.ReactNode][]; cols?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-6 ${cols === 2 ? "lg:grid-cols-2" : ""}`}>{/* 2분할 = 칸 단위(간격 24 = 그리드 거터) */}
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-body">
          <dt className="shrink-0 text-meta text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 감사 로그 줄(발주·브랜드 상세 공용): 시각 SUIT muted + 액션 500 + 변경 내용 */
export function LogList({ logs }: { logs: { created_at: string; action: string; diff: unknown }[] }) {
  if (!logs.length) return <p className="text-body text-ink-2">-</p>;
  return (
    <ul className="text-meta text-ink-2">
      {logs.map((l, i) => (
        <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 border-b border-line py-2.5">
          <span className="num text-muted">{fmtDate(l.created_at, "ko", true)}</span>
          <span className="num min-w-0 break-all"><span className="font-medium text-ink">{l.action}</span> · {JSON.stringify(l.diff)}</span>
        </li>
      ))}
    </ul>
  );
}
