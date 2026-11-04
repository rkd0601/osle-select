import Link from "next/link";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n";

/**
 * 브랜드 영역 목록·상세 공통 조각 (디자인 v2). 목록 행 자체는 components/domain/index-row(`.row`)를 쓴다 — 상품 그리드가 아니다(CLAUDE.md).
 * 문구는 전부 i18n(규칙 10).
 */

/** 발주·샘플 제목 `{첫 상품명} 외 n · {수량}장` (DECISIONS d-4). 상품명이 없으면 fallback(날짜 제목 등) */
export function bundleTitle(b: { firstName: string | null; more: number }, qty: number, fallback: string) {
  if (!b.firstName) return fallback;
  return b.more > 0 ? tk("common.bundleMore", { name: b.firstName, n: b.more, qty }) : tk("common.bundleOne", { name: b.firstName, qty });
}

/** 눈썹용 짧은 id: 앞 4자 대문자 (#CD20) */
export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 4).toUpperCase();

/** 기한 문구 + 톤(인덱스 행 dueTone): 지남 = crit, 2일 안 = warn */
export function dueOf(at: string | null | undefined, withTime = false): { text: string; tone: "default" | "warn" | "crit" } | null {
  if (!at) return null;
  const late = isOverdue(at);
  const soon = !late && new Date(at).getTime() - Date.now() < 2 * 86400000;
  return { text: tk(late ? "common.overdue" : "common.dueIn", { date: fmtDate(at, "ko", withTime) }), tone: late ? "crit" : soon ? "warn" : "default" };
}

/** 기한 표시(인라인): 지남 = crit, 그 외 ink-2 */
export function Due({ at, withTime = false }: { at: string; mine?: boolean; withTime?: boolean }) {
  const late = isOverdue(at);
  return <span className={`num text-meta ${late ? "font-medium text-crit" : "text-ink-2"}`}>{tk(late ? "common.overdue" : "common.dueIn", { date: fmtDate(at, "ko", withTime) })}</span>;
}

/** 상세 화면 위 "목록" 링크 — 화살표 없이 muted 텍스트 링크(44px 터치) */
export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex min-h-11 items-center text-meta text-muted hover:text-ink">{tk("common.backTo", { name: label })}</Link>;
}

/** 검색어 정규화 (공백·대소문자 무시) */
export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
export const matches = (q: string | undefined, ...fields: (string | null | undefined)[]) => !q || fields.some((f) => norm(f).includes(norm(q)));

/** 탭은 행이 이만큼 넘을 때만 (디자인 v2: 도움이 될 때만), 검색은 20건 이상 */
export const TABS_FROM = 8;
export const SEARCH_FROM = 20;

/** 브랜드 목록의 탭·검색 쿼리 */
export type ListQuery = { tab?: string; q?: string };
