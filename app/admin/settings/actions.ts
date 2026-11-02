"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { fxJob } from "@/lib/cron-jobs";
import { numericDef, settingAuditAction, validNumeric } from "@/lib/settings-schema";
import { ListSchemas, LIST_SETTINGS, type ListSettingKey } from "@/lib/settings-lists";

/**
 * A-08 설정 변경 (PRD 5장). settings는 authenticated에서 revoke(0005) → 서비스 롤로만 쓴다.
 * 모든 변경 = update_setting RPC(0048: upsert + 감사 로그 원자, 이력은 트리거) — 절대 규칙 12: 환율·마진·수수료 포함.
 * 환율을 바꾸면 그 자리에서 fxJob을 돌려 기준을 넘은 제안 상품을 재확인으로 보낸다(DECISIONS r6-3). 발행된 제안은 발행 시점 값 고정(규칙 3).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Key = z.string().min(1).max(60);

async function write(actorId: string, key: string, value: unknown) {
  // 0048 update_setting: upsert(또는 null이면 삭제) + 감사 로그를 한 트랜잭션으로. 이력은 트리거가 남긴다(이중 기록 없음).
  const { data, error } = await createAdminClient().rpc("update_setting", {
    p_key: key, p_value: value as never, p_actor: actorId, p_action: settingAuditAction(key),
  });
  if (error) throw new Error(error.message);
  const r = data as { changed: boolean; before: unknown } | null;
  return { changed: !!r?.changed, before: r?.before ?? null };
}

export async function updateNumericSetting(key: string, value: unknown): Promise<Result<{ changed: boolean; fxRechecked?: number }>> {
  const def = Key.safeParse(key).success ? numericDef(key) : undefined;
  if (!def || typeof value !== "number" || !validNumeric(def, value)) return { ok: false, error: "settings.error.range" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  try {
    const w = await write(admin.id, key, value);
    let fxRechecked: number | undefined;
    if (w.changed && key === "fx_rate_cny_krw") fxRechecked = (await fxJob()).products;
    revalidatePath("/admin/settings");
    return { ok: true, data: { changed: w.changed, fxRechecked } };
  } catch {
    return { ok: false, error: "common.error" };
  }
}

export async function updateListSetting(key: string, value: unknown): Promise<Result<{ changed: boolean }>> {
  if (!(LIST_SETTINGS as readonly string[]).includes(key)) return { ok: false, error: "common.invalid" };
  const parsed = ListSchemas[key as ListSettingKey].safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.message === "duplicate") ? "settings.error.duplicate" : "settings.error.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  try {
    const w = await write(admin.id, key, parsed.data);
    revalidatePath("/admin/settings");
    return { ok: true, data: { changed: w.changed } };
  } catch {
    return { ok: false, error: "common.error" };
  }
}
