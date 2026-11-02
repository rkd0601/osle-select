import { type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

/** 타임라인 (공통 컴포넌트 3/8). 1px 세로 룰 + 날짜는 SUIT tabular. 이벤트 문구는 호출부가 i18n으로 만든다. */
export type TimelineRow = { at: string; label: string; sub?: string | null; tone?: "default" | "brand" | "warn" };

export function Timeline({ rows, locale = "ko", empty }: { rows: TimelineRow[]; locale?: Locale; empty?: string }) {
  if (!rows.length) return empty ? <p className="text-body text-ink-2">{empty}</p> : null;
  return (
    <ol className="relative ml-1 border-l border-line">
      {rows.map((r, i) => (
        <li key={i} className="relative pb-4 pl-4 last:pb-0">
          <span className={`absolute -left-[3.5px] top-1.5 h-[6px] w-[6px] rounded-full ${r.tone === "brand" ? "bg-signature" : r.tone === "warn" ? "bg-warn" : "bg-ink-2"}`} />
          <div className="flex items-baseline gap-3 text-body">
            <span className="num w-24 shrink-0 text-muted">{fmtDate(r.at, locale, true)}</span>
            <span className="font-medium">{r.label}</span>
          </div>
          {r.sub && <p className="ml-[108px] mt-0.5 text-meta text-ink-2">{r.sub}</p>}
        </li>
      ))}
    </ol>
  );
}
