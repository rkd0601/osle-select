import { type Locale } from "@/lib/i18n";
import { fmtDate, fmtDay } from "@/lib/format";

/**
 * 타임라인 `.tl` (디자인 v2 §4). 왼쪽 1px 룰, 7px 점(마지막 = 지금, ink 채움), 시각 SUIT 13 muted + 내용 13.
 * 이벤트 문구는 호출부가 i18n으로 만든다. tone warn은 글자만 warn(금색·네이비는 쓰지 않는다).
 * day=true(브랜드 화면, v2.2): 시각을 "11월 4일 11:56"으로, 같은 날 이어지는 행은 "11:59"만.
 */
export type TimelineRow = { at: string; label: string; sub?: string | null; tone?: "default" | "brand" | "warn" };

const hm = (v: string) => new Intl.DateTimeFormat("ko", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(v));

export function Timeline({ rows, locale = "ko", empty, day = false }: { rows: TimelineRow[]; locale?: Locale; empty?: string; day?: boolean }) {
  if (!rows.length) return empty ? <p className="text-meta text-ink-2">{empty}</p> : null;
  return (
    <ul className="tl">
      {rows.map((r, i) => {
        const prev = i > 0 ? fmtDay(rows[i - 1].at) : null;
        const when = day ? (prev === fmtDay(r.at) ? hm(r.at) : `${fmtDay(r.at)} ${hm(r.at)}`) : fmtDate(r.at, locale, true);
        return (
          <li key={i} className={i === rows.length - 1 ? "now" : undefined}>
            <span className="when">{when}</span>
            <span className={`what ${r.tone === "warn" ? "text-warn" : ""}`}>
              {r.label}
              {r.sub && <span className="block font-normal text-ink-2">{r.sub}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
