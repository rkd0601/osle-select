"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { VendorDefaults, VendorInput } from "@/lib/products";

/** A-08 원청 관리(일부). ADMIN만. 기본값(홀딩·샘플·라벨·수정)은 상품이 상속한다 — 바꾸면 감사 로그. */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Schema = VendorInput.merge(VendorDefaults);

export async function saveVendor(vendorId: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = Schema.safeParse(input);
  if ((vendorId && !z.guid().safeParse(vendorId).success) || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const v = parsed.data;
  const row = {
    name: v.name, market: v.market || null, booth: v.booth || null, wechat: v.wechat || null,
    default_hold: v.defaultHold, default_sample_ok: v.defaultSampleOk, default_label_options: v.defaultLabelOptions, default_mod_options: v.defaultModOptions,
    notes: v.notes || null,
  };
  const db = createAdminClient();
  if (vendorId) {
    const { data: before } = await db.from("vendors").select("default_hold, default_sample_ok, default_label_options, default_mod_options").eq("id", vendorId).maybeSingle();
    if (!before) return { ok: false, error: "common.notFound" };
    const { error } = await db.from("vendors").update(row).eq("id", vendorId);
    if (error) return { ok: false, error: "common.error" };
    await db.from("audit_logs").insert({ actor_id: admin.id, action: "vendor.defaults_update", entity: "vendor", entity_id: vendorId, diff: { from: before, to: { default_hold: row.default_hold, default_sample_ok: row.default_sample_ok, default_label_options: row.default_label_options, default_mod_options: row.default_mod_options } } });
    revalidatePath("/admin/vendors", "page");
    return { ok: true, data: { id: vendorId } };
  }
  const { data, error } = await db.from("vendors").insert({ ...row, created_by: admin.id }).select("id").single();
  if (error || !data) return { ok: false, error: "common.error" };
  revalidatePath("/admin/vendors", "page");
  return { ok: true, data: { id: data.id } };
}
