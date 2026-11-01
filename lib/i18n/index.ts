/**
 * 최소 i18n. 사용자에게 보이는 문자열은 전부 여기 사전에서 꺼낸다 (CLAUDE.md 규칙 10).
 * next-intl 라우팅은 2차에 붙인다. 지금은 역할·프로필 로케일로 사전을 고른다.
 */
import ko from "./ko.json";
import zh from "./zh-CN.json";

export type Locale = "ko" | "zh-CN";
type Dict = Record<string, string>;
const dicts: Record<Locale, Dict> = { ko, "zh-CN": zh };

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = dicts[locale][key] ?? dicts.ko[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export const tk = (key: string, vars?: Record<string, string | number>) => t("ko", key, vars);
