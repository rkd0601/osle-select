import { type Locale } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

/**
 * 타임라인 `.tl` (디자인 v2 §4). 왼쪽 1px 룰, 7px 점(마지막 = 지금, ink 채움), 시각 SUIT 13 muted + 내용 13.
 * 이벤트 문구는 호출부가 i18n으로 만든다. tone warn은 글자만 warn(금색·네이비는 쓰지 않는다).
 */
export type TimelineRow = { at: string; label: string; sub?: string | null; tone?: "default" | "brand" | "warn" };

export function Timeline({ rows, locale = "ko", empty }: { rows: TimelineRow[]; locale?: Locale; empty?: string }) {
  if (!rows.length) return empty ? <p className="text-meta text-ink-2">{empty}</p> : null;
  return (
    <ul className="tl">
      {rows.map((r, i) => (
        <li key={i} className={i === rows.length - 1 ? "now" : undefined}>
          <span className="when">{fmtDate(r.at, locale, true)}</span>
          <span className={`what ${r.tone === "warn" ? "text-warn" : ""}`}>
            {r.label}
            {r.sub && <span className="block font-normal text-ink-2">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
