/** 표시용 포맷. 날짜는 UTC 저장, 역할별 TZ로 표시 (CLAUDE.md 코딩 규칙). 금액은 정수 KRW. */
import type { Locale } from "./i18n";

const TZ: Record<Locale, string> = { ko: "Asia/Seoul", "zh-CN": "Asia/Shanghai" };

export const krw = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

export function fmtDate(v: string | Date | null | undefined, locale: Locale = "ko", withTime = false): string {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v) : v;
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ[locale], month: "2-digit", day: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(d);
}

/** 브랜드 화면 날짜(디자인 v2.2 §1·d-11): "11월 18일" — 사람 말 문장 안에 넣는다. 연도가 다르면 "2027년 1월 5일" */
export function fmtDay(v: string | Date | null | undefined, now = new Date()): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v) : v;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d).map((p) => [p.type, p.value]));
  const nowYear = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now);
  return `${parts.year !== nowYear ? `${parts.year}년 ` : ""}${parts.month}월 ${parts.day}일`;
}

export const isOverdue =(due: string | null | undefined, now = new Date()) => !!due && new Date(due).getTime() < now.getTime();
