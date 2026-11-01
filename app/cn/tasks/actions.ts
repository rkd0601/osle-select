"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCn } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";

/**
 * C-05 처리 큐 — 샘플 출고. 입금 확인 전(awaiting_payment)에는 출고할 수 없다(전이 테이블: requested에서만 cn_shipped).
 * CN은 본인 상품이 들어 있는 요청서만 출고할 수 있다.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function shipSample(sampleId: string, tracking: string): Promise<Result<null>> {
  if (!z.guid().safeParse(sampleId).success || !z.string().trim().min(4).max(40).safeParse(tracking).success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: sr } = await db.from("sample_requests").select("id, status").eq("id", sampleId).maybeSingle();
  if (!sr) return { ok: false, error: "common.notFound" };
  if (actor.role !== "ADMIN") {
    const { data: items } = await db.from("sample_items").select("offer_id").eq("sample_request_id", sampleId);
    const { data: offers } = await db.from("offers").select("product_id").in("id", (items ?? []).map((i) => i.offer_id));
    const { data: mine } = await db.from("products").select("id").eq("created_by", actor.id).in("id", (offers ?? []).map((o) => o.product_id)).limit(1);
    if (!mine?.length) return { ok: false, error: "common.notFound" };
  }
  const res = await applyTransition(db, {
    entity: "sample_request", id: sampleId, from: sr.status, to: "cn_shipped", role: actor.role, actorId: actor.id, settings: await getSettings(),
    patch: { cn_tracking: tracking.trim(), cn_shipped_at: new Date().toISOString() },
  });
  if (!res.ok) return res;
  await notify({ type: "sample.cn_shipped", sampleId });
  revalidatePath("/cn/tasks", "page");
  revalidatePath("/admin/samples", "page");
  return { ok: true, data: null };
}
