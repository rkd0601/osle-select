import { type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

/** 타임라인 (공통 컴포넌트 3/8). 1px 세로 룰 + 날짜는 SUIT tabular. 마지막(최근) 점은 크게. 이벤트 문구는 호출부가 i18n으로 만든다. */
export type TimelineRow = { at: string; label: string; sub?: string | null; tone?: "default" | "brand" | "warn" };

export function Timeline({ rows, locale = "ko", empty }: { rows: TimelineRow[]; locale?: Locale; empty?: string }) {
  if (!rows.length) return empty ? <p className="text-body text-ink-2">{empty}</p> : null;
  return (
    <ol className="relative ml-1.5 border-l border-line">
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        const dot = r.tone === "brand" ? "bg-signature" : r.tone === "warn" ? "bg-warn" : last ? "bg-ink" : "bg-line-strong";
        return (
          <li key={i} className="relative pb-4 pl-5 last:pb-0">
            <span aria-hidden className={`absolute top-1.5 rounded-full ${last ? "-left-[5px] h-[9px] w-[9px]" : "-left-[3.5px] h-[6px] w-[6px]"} ${dot}`} />
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="num shrink-0 text-caption text-muted sm:w-24">{fmtDate(r.at, locale, true)}</span>
              <span className={`text-body ${last ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>{r.label}</span>
            </div>
            {r.sub && <p className="mt-0.5 text-meta text-ink-2 sm:ml-[108px]">{r.sub}</p>}
          </li>
        );
      })}
    </ol>
  );
}
