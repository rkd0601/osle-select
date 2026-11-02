/**
 * 최소 i18n. 사용자에게 보이는 문자열은 전부 여기 사전에서 꺼낸다 (CLAUDE.md 규칙 10).
 * next-intl 라우팅은 2차에 붙인다. 지금은 역할·프로필 로케일로 사전을 고른다.
 *
 * 사전은 영역별로 나눈다 (11단계): 이 모듈 = 공통·브랜드·공개 화면. 클라이언트 컴포넌트가 import하면 사전이 그대로 번들에 실리므로,
 * 관리자 문구(숨은 마진·환율 설정 등)는 `@/lib/i18n/admin`, 중국 소싱 문구(목표 원가 등)는 `@/lib/i18n/cn`에만 둔다 —
 * 브랜드·원청(CN_VENDOR) 브라우저에 내부 용어가 내려가지 않게 (절대 규칙 1의 문구 판).
 */
import ko from "./ko.json";
import zh from "./zh-CN.json";

export type Locale = "ko" | "zh-CN";
export type Dict = Record<string, string>;

export function makeT(dicts: Record<Locale, Dict>) {
  const t = (locale: Locale, key: string, vars?: Record<string, string | number>): string => {
    let s = dicts[locale][key] ?? dicts.ko[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
  const tk = (key: string, vars?: Record<string, string | number>) => t("ko", key, vars);
  return { t, tk };
}

export const BASE: Record<Locale, Dict> = { ko, "zh-CN": zh };
export const { t, tk } = makeT(BASE);
