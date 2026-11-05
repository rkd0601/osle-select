import { Fragment } from "react";
import { type Locale } from "@/lib/i18n";
import { fmtDate, fmtDay } from "@/lib/format";

/**
 * 타임라인 `.tl` (디자인 v2.6 §3 R6). 점·세로선 없이, 날이 바뀔 때마다 날짜 줄(`li.day`, 12/16 muted)을 먼저 두고
 * 그 아래 행은 시각 1칸(71) + 24 → 내용 둘째 선. 마지막 행 = 지금(ink 500).
 * 이벤트 문구는 호출부가 i18n으로 만든다. tone warn은 글자만 warn(금색·네이비는 쓰지 않는다).
 * 날짜 줄은 브랜드(ko) "11월 4일", 그 밖의 로케일은 "11/04" 꼴. `day`는 예전 호출부 호환용(이제 항상 날짜 줄).
 */
export type TimelineRow = { at: string; label: string; sub?: string | null; tone?: "default" | "brand" | "warn" };

const TZ: Record<Locale, string> = { ko: "Asia/Seoul", "zh-CN": "Asia/Shanghai" };
const hm = (v: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { timeZone: TZ[locale] ?? "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(v));
const dayOf = (v: string, locale: Locale) => (locale === "ko" ? fmtDay(v) : fmtDate(v, locale));

export function Timeline({ rows, locale = "ko", empty }: { rows: TimelineRow[]; locale?: Locale; empty?: string; day?: boolean }) {
  if (!rows.length) return empty ? <p className="text-meta text-ink-2">{empty}</p> : null;
  return (
    <ul className="tl">
      {rows.map((r, i) => {
        const d = dayOf(r.at, locale);
        const newDay = i === 0 || dayOf(rows[i - 1].at, locale) !== d;
        return (
          <Fragment key={i}>
            {newDay && <li className="day">{d}</li>}
            <li className={i === rows.length - 1 ? "now" : undefined}>
              <span className="when">{hm(r.at, locale)}</span>
              <span className={`what ${r.tone === "warn" ? "text-warn" : ""}`}>
                {r.label}
                {r.sub && <span className="block font-normal text-ink-2">{r.sub}</span>}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
