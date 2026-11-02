"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor, requireBrandAccess } from "@/lib/auth/guards";
import { isBrandRole, isCnRole } from "@/lib/config";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";
import { CommentInput, commentAudience, resolveVisibility, translationOf, type AuthorKind, type CommentTarget } from "@/lib/comments";

/**
 * 통합 코멘트 쓰기 (8단계). 행위자 → 가시성(lib/comments) → 대상 소유 확인(코드, RLS와 이중) → cn이면 번역 → 행 → notify.
 * 번역 입력은 코멘트 본문 하나뿐(원가 필드 없음, 규칙 11). 번역이 실패해도 원문은 저장한다(상대 언어 칸이 비어 보인다).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Target = { brandId: string | null; slug: string; requestId?: string; orderId?: string; productId?: string; cnOwner: string | null };

async function loadTarget(type: CommentTarget, id: string): Promise<Target | null> {
  const db = createAdminClient();
  const slugOf = (b: unknown) => ((Array.isArray(b) ? b[0] : b) as { slug?: string } | null)?.slug ?? "";
  switch (type) {
    case "request": {
      const { data } = await db.from("requests").select("id, brand_id, brands(slug)").eq("id", id).maybeSingle();
      return data && { brandId: data.brand_id, slug: slugOf(data.brands), requestId: data.id, cnOwner: null };
    }
    case "request_item": {
      const { data } = await db.from("request_items").select("id, brand_id, request_id, assigned_to, brands(slug)").eq("id", id).maybeSingle();
      return data && { brandId: data.brand_id, slug: slugOf(data.brands), requestId: data.request_id, cnOwner: data.assigned_to };
    }
    case "offer": {
      const { data } = await db.from("offers").select("id, brand_id, product_id, brands(slug), products(created_by)").eq("id", id).maybeSingle();
      const owner = ((Array.isArray(data?.products) ? data?.products[0] : data?.products) as { created_by?: string } | null)?.created_by ?? null;
      return data && { brandId: data.brand_id, slug: slugOf(data.brands), productId: data.product_id, cnOwner: owner };
    }
    case "sample_request": {
      const { data } = await db.from("sample_requests").select("id, brand_id, brands(slug)").eq("id", id).maybeSingle();
      return data && { brandId: data.brand_id, slug: slugOf(data.brands), cnOwner: null };
    }
    case "order": {
      const { data } = await db.from("orders").select("id, brand_id, brands(slug)").eq("id", id).maybeSingle();
      return data && { brandId: data.brand_id, slug: slugOf(data.brands), orderId: data.id, cnOwner: null };
    }
    case "order_line": {
      const { data } = await db.from("order_lines").select("id, brand_id, order_id, brands(slug)").eq("id", id).maybeSingle();
      return data && { brandId: data.brand_id, slug: slugOf(data.brands), orderId: data.order_id, cnOwner: null };
    }
  }
}

function linkFor(audience: "admin" | "brand" | "cn", type: CommentTarget, id: string, t: Target): string {
  if (audience === "cn") return type === "offer" ? `/cn/products/${t.productId}` : `/cn/items/${id}`;
  const base = audience === "brand" ? `/b/${t.slug}` : "/admin";
  switch (type) {
    case "request": case "request_item": return `${base}/requests/${t.requestId}`;
    case "offer": return `${base}/offers`;
    case "sample_request": return `${base}/samples/${id}`;
    case "order": case "order_line": return `${base}/orders/${t.orderId}`;
  }
}

export async function addComment(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CommentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "common.invalid" };
  const actor = await getActor();
  if (!actor) return { ok: false, error: "common.notFound" };
  if (actor.role !== "ADMIN" && !isCnRole(actor.role) && !isBrandRole(actor.role)) return { ok: false, error: "common.forbidden" };
  const author: AuthorKind = actor.role === "ADMIN" ? "admin" : isCnRole(actor.role) ? "cn" : "brand";
  const { targetType, targetId, body } = parsed.data;
  const visibility = resolveVisibility(author, targetType, parsed.data.visibility);
  if (!visibility) return { ok: false, error: "common.forbidden" };
  const t = await loadTarget(targetType, targetId);
  if (!t) return { ok: false, error: "common.notFound" };
  // 소유 확인: 브랜드는 그 브랜드 멤버, CN은 본인 배정 항목·본인 상품 (RLS comments_cn과 같은 기준)
  if (author === "brand" && (!t.brandId || !(await requireBrandAccess(t.brandId)))) return { ok: false, error: "common.notFound" };
  if (author === "cn" && t.cnOwner !== actor.id) return { ok: false, error: "common.notFound" };

  const tr = translationOf(author, visibility);
  let other: string | null = null;
  if (tr.translateTo) {
    const r = await translate({ from: tr.source, to: tr.translateTo, segments: [{ field: "comment", text: body }] });
    other = r.ok ? r.data[0] : null;
  }
  const row = tr.source === "zh-CN" ? { body_zh: body, body_ko: other } : { body_ko: body, body_zh: other };
  const { data, error } = await createAdminClient()
    .from("comments")
    .insert({ target_type: targetType, target_id: targetId, brand_id: t.brandId, author_id: actor.id, visibility, ...row })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "common.error" };

  const audience = commentAudience(author, visibility);
  if (audience && !(audience === "cn" && !t.cnOwner)) {
    await notify({
      type: "comment.added", audience, brandId: t.brandId, cnIds: t.cnOwner ? [t.cnOwner] : [],
      link: linkFor(audience, targetType, targetId, t), entity: targetType, entityId: targetId,
    });
  }
  for (const p of ["/b/[slug]/requests/[id]", "/b/[slug]/samples/[id]", "/b/[slug]/orders/[id]", "/admin/requests/[id]", "/admin/samples/[id]", "/admin/orders/[id]", "/cn/items/[id]"]) revalidatePath(p, "page");
  return { ok: true, data: { id: data.id } };
}
