"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { fxJob } from "@/lib/cron-jobs";
import { ListSchemas, LIST_SETTINGS, numericDef, settingAuditAction, validNumeric, type ListSettingKey } from "@/lib/settings-schema";

/**
 * A-08 설정 변경 (PRD 5장). settings는 authenticated에서 revoke(0005) → 서비스 롤로만 쓴다.
 * 모든 변경 = settings upsert + settings_history(old·new) + 감사 로그(절대 규칙 12: 환율·마진·수수료 포함).
 * 환율을 바꾸면 그 자리에서 fxJob을 돌려 기준을 넘은 제안 상품을 재확인으로 보낸다(DECISIONS r6-3). 발행된 제안은 발행 시점 값 고정(규칙 3).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Key = z.string().min(1).max(60);

async function write(actorId: string, key: string, value: unknown) {
  const db = createAdminClient();
  const { data: prev } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  const before = prev?.value ?? null;
  if (JSON.stringify(before) === JSON.stringify(value)) return { changed: false, before };
  const { error } = await db.from("settings").upsert({ key, value, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await db.from("settings_history").insert({ key, old_value: before, new_value: value, changed_by: actorId });
  await db.from("audit_logs").insert({ actor_id: actorId, action: settingAuditAction(key), entity: "settings", entity_id: null, diff: { key, before, after: value } });
  return { changed: true, before };
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
