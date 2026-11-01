"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { VendorDefaults, VendorInput, stableJson } from "@/lib/products";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";

/** A-08 원청 관리(일부). ADMIN만. 기본값(홀딩·샘플·라벨·수정)은 상품이 상속한다 — 바꾸면 감사 로그. */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Schema = VendorInput.merge(VendorDefaults).extend({ ownerProfileId: z.guid().nullable().optional() });

export async function saveVendor(vendorId: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = Schema.safeParse(input);
  if ((vendorId && !z.guid().safeParse(vendorId).success) || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const v = parsed.data;
  // CN_VENDOR 계정 지정: 그 사용자가 실제 CN_VENDOR인지 확인 (Q5)
  if (parsed.data.ownerProfileId) {
    const { data: u } = await createAdminClient().auth.admin.getUserById(parsed.data.ownerProfileId);
    if (u?.user?.app_metadata?.role !== "CN_VENDOR") return { ok: false, error: "common.invalid" };
  }
  const row = {
    owner_profile_id: parsed.data.ownerProfileId ?? null,
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
    // 홀딩 기본값이 바뀌면 그걸 상속하는 공개 상품은 재확인(D16) — 걸린 제안은 트리거가 가린다
    if (stableJson(before.default_hold) !== stableJson(row.default_hold)) {
      const { data: inheriting } = await db.from("products").select("id, status").eq("vendor_id", vendorId).is("hold_override", null).in("status", ["reviewed", "offering", "repool"]);
      const settings = await getSettings();
      for (const p of inheriting ?? []) {
        await applyTransition(db, { entity: "product", id: p.id, from: p.status, to: "recheck", role: "ADMIN", actorId: admin.id, settings, patch: { recheck_reason: "default_hold" }, note: "default_hold" });
      }
    }
    revalidatePath("/admin/vendors", "page");
    return { ok: true, data: { id: vendorId } };
  }
  const { data, error } = await db.from("vendors").insert({ ...row, created_by: admin.id }).select("id").single();
  if (error || !data) return { ok: false, error: "common.error" };
  revalidatePath("/admin/vendors", "page");
  return { ok: true, data: { id: data.id } };
}
