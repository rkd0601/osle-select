import { z } from "zod";

/** A-08 목록 키 검사 (서버 액션·테스트용 — 화면 번들에 zod가 딸려 가지 않게 숫자 키 정의와 나눴다) */
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

