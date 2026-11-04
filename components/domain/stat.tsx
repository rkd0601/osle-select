import Link from "next/link";

/**
 * @deprecated 디자인 v2(§4)에서 타일형 통계는 삭제 — Figure/KpiRow로 옮긴다. 3·4단계 화면 이전이 끝나면 파일을 지운다.
 * 그 사이에는 v2 모양(룰 사이 숫자 40/300, 상자 없음)으로 그린다.
 */
export type StatItem = { label: string; value: string | number; hint?: string; href?: string; tone?: "default" | "brand" | "warn" | "crit" };

const TONE = { default: "", brand: "", warn: "text-warn", crit: "text-crit" } as const;

export function StatGrid({ items }: { items: StatItem[]; columns?: 2 | 3 | 4 | 5 }) {
  return (
    <div className="kpi" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))` }}>
      {items.map((s) => {
        const body = (
          <>
            <div className="label">{s.label}</div>
            <div className={`v num ${TONE[s.tone ?? "default"]}`}>{s.value}</div>
            {s.hint && <div className="sub">{s.hint}</div>}
          </>
        );
        return s.href ? <Link key={s.label} href={s.href} className="block hover:text-signature">{body}</Link> : <div key={s.label}>{body}</div>;
      })}
    </div>
  );
}
