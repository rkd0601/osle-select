/**
 * 소싱 담당(CN_SOURCER) 전용 문구 = cn 사전 + 목표 원가 같은 내부 산출 문구 (DECISIONS 11-4).
 * 서버 컴포넌트에서만 쓴다 — 클라이언트 번들(원청 CN_VENDOR 브라우저 포함)에 실리지 않게. 테스트가 "use client" 파일의 import를 막는다.
 */
import "server-only";
import { CN_DICTS } from "./cn";
import { makeT, type Dict, type Locale } from "./index";
import koSourcer from "./ko.cn-sourcer.json";
import zhSourcer from "./zh-CN.cn-sourcer.json";

export const SOURCER_DICTS: Record<Locale, Dict> = { ko: { ...CN_DICTS.ko, ...koSourcer }, "zh-CN": { ...CN_DICTS["zh-CN"], ...zhSourcer } };
export const { t, tk } = makeT(SOURCER_DICTS);
