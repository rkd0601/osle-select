import { z } from "zod";
import { DEFAULT_SETTINGS, type SettingKey } from "@/lib/config";

/**
 * A-08 설정 키 정의 (순수, PRD 5장). 숫자 키는 DEFAULT_SETTINGS와 1:1 — 새 키는 여기와 config 둘 다(테스트가 잡는다).
 * unit: krw(원) · rate(0~1 소수, 화면은 %) · days · hours · count. 범위 밖 값은 서버가 거부한다.
 * 라벨은 i18n `settings.key.<key>`, 그룹 제목은 `settings.group.<group>`.
 */
export type SettingUnit = "krw" | "rate" | "days" | "hours" | "count";
export type SettingGroup = "money" | "logistics" | "periods" | "etc";
export type NumericSettingDef = { key: SettingKey; group: SettingGroup; unit: SettingUnit; min: number; max: number };

const d = (key: SettingKey, group: SettingGroup, unit: SettingUnit, min: number, max: number): NumericSettingDef => ({ key, group, unit, min, max });

export const NUMERIC_SETTINGS: NumericSettingDef[] = [
  d("fx_rate_cny_krw", "money", "krw", 100, 400),
  d("hidden_margin_rate", "money", "rate", 0, 0.5),
  d("fee_rate", "money", "rate", 0, 0.5),
  d("fx_recheck_pct", "money", "rate", 0.005, 0.2),
  d("sample_air_per_kg_krw", "logistics", "krw", 0, 100_000),
  d("domestic_shipping_krw", "logistics", "krw", 0, 50_000),
  d("logistics_estimate_per_kg_krw", "logistics", "krw", 0, 100_000),
  d("customs_estimate_rate", "logistics", "rate", 0, 0.6),
  d("exclusive_days", "periods", "days", 0, 90),
  d("offer_valid_days", "periods", "days", 1, 180),
  d("sample_feedback_days", "periods", "days", 1, 60),
  d("sample_return_days", "periods", "days", 1, 60),
  d("report_days", "periods", "days", 1, 60),
  d("cn_question_gate_hours", "periods", "hours", 0, 48),
  d("review_sla_days", "periods", "days", 1, 14),
  d("intake_sla_days", "periods", "days", 1, 14),
  d("stock_check_days", "periods", "days", 1, 14),
  d("deposit_days", "periods", "days", 1, 30),
  d("quote_sla_days", "periods", "days", 1, 14),
  d("reconsent_days", "periods", "days", 1, 14),
  d("cn_ship_days", "periods", "days", 1, 30),
  d("logistics_days", "periods", "days", 1, 60),
  d("min_lead_days", "periods", "days", 0, 120),
  d("sample_qty_max", "etc", "count", 1, 20),
  d("quote_margin_pct", "etc", "rate", 0, 0.5),
  d("target_diff_pct", "etc", "rate", 0, 1),
];
export const SETTING_GROUPS: SettingGroup[] = ["money", "logistics", "periods", "etc"];
export const numericDef = (key: string) => NUMERIC_SETTINGS.find((s) => s.key === key);

/** 값 검사: 범위 + 단위별 형태(원·일·시간·개는 정수, 비율은 소수 4자리까지) */
export function validNumeric(def: NumericSettingDef, v: number): boolean {
  if (!Number.isFinite(v) || v < def.min || v > def.max) return false;
  if (def.unit === "rate") return Math.abs(Math.round(v * 10_000) - v * 10_000) < 1e-6;
  return Number.isInteger(v);
}

/** 화면 입력(%) ↔ 저장값(소수). 비율만 변환 */
export const toInput = (def: NumericSettingDef, v: number) => (def.unit === "rate" ? Math.round(v * 1_000_000) / 10_000 : v);
export const fromInput = (def: NumericSettingDef, s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return def.unit === "rate" ? Math.round(n * 100) / 10_000 : n;
};

/** 목록 키 (JSON) */
export const LIST_SETTINGS = ["categories", "rejection_templates", "bank_account"] as const;
export type ListSettingKey = (typeof LIST_SETTINGS)[number];
export const ListSchemas = {
  categories: z.array(z.string().trim().min(1).max(20)).min(1).max(30).refine((a) => new Set(a).size === a.length, "duplicate"),
  rejection_templates: z
    .array(z.object({ code: z.string().regex(/^[a-z0-9_]{2,30}$/), ko: z.string().trim().min(1).max(60), zh: z.string().trim().min(1).max(60) }))
    .max(30)
    .refine((a) => new Set(a.map((x) => x.code)).size === a.length, "duplicate"),
  bank_account: z.object({ bank: z.string().trim().min(1).max(30), number: z.string().trim().regex(/^[0-9-]{6,30}$/), holder: z.string().trim().min(1).max(40) }).nullable(),
} satisfies Record<ListSettingKey, z.ZodType>;

/** 감사 로그 액션: 환율은 따로(즉시 fxJob 트리거와 짝), 나머지는 settings.update — 둘 다 settings.* 라 돈 탭에 들어간다 */
export const settingAuditAction = (key: string) => (key === "fx_rate_cny_krw" ? "settings.fx_update" : "settings.update");

/** 기본값이 정의된 키 전부가 화면에 있는지(테스트용) */
export const ALL_NUMERIC_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
