/** /cn 영역 사전 = 공통 + 중국 소싱(cn.*). 관리자 문구는 없다 — 원청 외부 계정(CN_VENDOR) 번들에도 실린다 */
import { BASE, makeT, type Dict, type Locale } from "./index";
import koCn from "./ko.cn.json";
import zhCn from "./zh-CN.cn.json";
import koVendor from "./ko.cn-vendor.json";
import zhVendor from "./zh-CN.cn-vendor.json";

export type { Locale } from "./index";
export const CN_DICTS: Record<Locale, Dict> = { ko: { ...BASE.ko, ...koCn }, "zh-CN": { ...BASE["zh-CN"], ...zhCn } };
export const { t, tk } = makeT(CN_DICTS);

/** 원청 계정(CN_VENDOR)이 보는 가격 입력 라벨 — 자기 공급가라 "원가" 대신 "공급 단가"/"报价档" (DECISIONS 13-1). 소싱 담당 문구는 그대로 */
const VENDOR_DICTS: Record<Locale, Dict> = { ko: { ...CN_DICTS.ko, ...koVendor }, "zh-CN": { ...CN_DICTS["zh-CN"], ...zhVendor } };
const { t: tVendor } = makeT(VENDOR_DICTS);
export const tFor = (vendor: boolean) => (vendor ? tVendor : t);
