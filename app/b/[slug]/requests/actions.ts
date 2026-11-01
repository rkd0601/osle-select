"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { insertRequest } from "@/lib/db/requests.write";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { RequestInput, isEditableByBrand, isOwnRequestImagePath } from "@/lib/requests";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.string().uuid();

/** B-02 요청 생성. 관리자가 /b/{slug}에서 대행하면 admin_proxy + 감사 로그 */
export async function createRequest(brandId: string, input: unknown): Promise<Result<{ requestId: string }>> {
  const parsed = RequestInput.safeParse(input);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: parsed.error?.issues[0]?.message.startsWith("request.") ? parsed.error.issues[0].message : "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const res = await insertRequest(createAdminClient(), {
    brandId,
    actorId: access.actor.id,
    createdVia: access.onBehalf ? "admin_proxy" : "brand",
    input: parsed.data,
    settings: await getSettings(),
  });
  if (!res.ok) return res;
  await notify({ type: "request.created", brandId, requestId: res.data.requestId, itemCount: res.data.itemCount });
  revalidatePath("/b/[slug]/requests", "page");
  return { ok: true, data: { requestId: res.data.requestId } };
}

async function loadOwnItem(brandId: string, itemId: string) {
  const { data } = await createAdminClient().from("request_items").select("id, request_id, brand_id, seq, status").eq("id", itemId).eq("brand_id", brandId).maybeSingle();
  return data;
}

/** 항목 취소 (received·needs_info·sourcing·on_hold → cancelled, 전이 테이블 기준) */
export async function cancelRequestItem(brandId: string, itemId: string): Promise<Result<null>> {
  if (!Id.safeParse(brandId).success || !Id.safeParse(itemId).success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const item = access && (await loadOwnItem(brandId, itemId));
  if (!access || !item) return { ok: false, error: "common.notFound" };
  const res = await applyTransition(createAdminClient(), {
    entity: "request_item", id: itemId, from: item.status, to: "cancelled", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id,
    settings: await getSettings(), onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  revalidatePath("/b/[slug]/requests/[id]", "page");
  return { ok: true, data: null };
}

const SupplySchema = z.object({
  note: z.string().trim().min(1).max(1000),
  imagePaths: z.array(z.string().max(200)).max(10).default([]),
  links: z.array(z.string().trim().url().max(1000)).max(5).default([]),
});

/** 보완 요청 응답: 코멘트 + 이미지·링크 추가 → needs_info → received (다시 ADMIN 차례) */
export async function supplyRequestInfo(brandId: string, itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = SupplySchema.safeParse(input);
  if (!Id.safeParse(brandId).success || !Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  if (parsed.data.imagePaths.some((p) => !isOwnRequestImagePath(brandId, p))) return { ok: false, error: "common.forbidden" };
  const access = await requireBrandAccess(brandId);
  const item = access && (await loadOwnItem(brandId, itemId));
  if (!access || !item) return { ok: false, error: "common.notFound" };
  if (!isEditableByBrand(item.status)) return { ok: false, error: "common.staleState" };
  const db = createAdminClient();
  // needs_info → received 는 전이, 이미 received(접수 대기)면 상태는 그대로 두고 자료만 보탠다(received→received 전이는 없다)
  if (item.status === "needs_info") {
    const res = await applyTransition(db, {
      entity: "request_item", id: itemId, from: item.status, to: "received", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id,
      settings: await getSettings(), onBehalfOfBrandId: access.onBehalf ? brandId : null,
    });
    if (!res.ok) return res;
  }
  const imgs = [
    ...parsed.data.imagePaths.map((p, k) => ({ storage_path: p, source_url: null, sort_order: 50 + k })),
    ...parsed.data.links.map((u, k) => ({ storage_path: null, source_url: u, sort_order: 150 + k })),
  ].map((i) => ({ ...i, request_id: item.request_id, request_item_id: itemId, brand_id: brandId }));
  if (imgs.length) await db.from("request_images").insert(imgs);
  await db.from("comments").insert({ target_type: "request_item", target_id: itemId, brand_id: brandId, author_id: access.actor.id, visibility: "brand", body_ko: parsed.data.note });
  await notify({ type: "request_item.info_supplied", brandId, requestId: item.request_id, itemSeq: item.seq });
  revalidatePath("/b/[slug]/requests/[id]", "page");
  return { ok: true, data: null };
}
