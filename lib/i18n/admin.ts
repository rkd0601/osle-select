/** /admin 영역 사전 = 공통 + 중국 소싱 + 관리자(admin·settings·audit·glossary·issue·measure·needsInfo). /admin 밖에서 import 금지(테스트) */
import { makeT, type Dict, type Locale } from "./index";
import { CN_DICTS } from "./cn";
import koAdmin from "./ko.admin.json";
import zhAdmin from "./zh-CN.admin.json";

export type { Locale } from "./index";
export const ADMIN_DICTS: Record<Locale, Dict> = { ko: { ...CN_DICTS.ko, ...koAdmin }, "zh-CN": { ...CN_DICTS["zh-CN"], ...zhAdmin } };
export const { t, tk } = makeT(ADMIN_DICTS);
