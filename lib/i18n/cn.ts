/** /cn 영역 사전 = 공통 + 중국 소싱(cn.*). 관리자 문구는 없다 — 원청 외부 계정(CN_VENDOR) 번들에도 실린다 */
import { BASE, makeT, type Dict, type Locale } from "./index";
import koCn from "./ko.cn.json";
import zhCn from "./zh-CN.cn.json";

export type { Locale } from "./index";
export const CN_DICTS: Record<Locale, Dict> = { ko: { ...BASE.ko, ...koCn }, "zh-CN": { ...BASE["zh-CN"], ...zhCn } };
export const { t, tk } = makeT(CN_DICTS);
