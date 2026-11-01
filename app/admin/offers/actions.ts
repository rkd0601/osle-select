"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { getSettings } from "@/lib/db/settings";
import { getMyProduct } from "@/lib/db/cn/products";
import { ownerAndDue } from "@/lib/sla";
import { notify } from "@/lib/notify";
import { canIssueOffer } from "@/lib/transitions";
import { resolveInherited } from "@/lib/products";
import { supplyPriceKrw, targetDiffPct } from "@/lib/pricing";
import { computeOfferFixed, issueBlocker, offerDates, offerType } from "@/lib/offers";

/**
 * A-04 제안 발행 = 누구에게 얼마에 (기획서 F4). 첫 제안·재제안·추천이 이 액션 하나.
 * 발행 = offers 1행 insert (가격·요율·환율·옵션 KRW·샘플비·독점·유효기간 고정, CLAUDE.md 절대 규칙 3·5). 상품은 복사하지 않는다.
 * 상품 코드 발급·상품 offering·항목 offered는 DB 트리거(0006)가 한다.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const IssueSchema = z.object({
  productId: z.guid(),
  brandId: z.guid(),
  requestItemId: z.guid().nullable(),
  comment: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function issueOffer(input: unknown): Promise<Result<{ offerId: string }>> {
  const parsed = IssueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "common.invalid" };
  const v = parsed.data;
  const admin = await requireAdmin();
  const full = admin && (await getMyProduct({ id: admin.id, role: "ADMIN" }, v.productId));
  if (!admin || !full) return { ok: false, error: "common.notFound" };
  const p = full.product;

  // 공개 조건은 서버가 다시 본다 (CLAUDE.md 절대 규칙 6). 검수완료 이후 상태만.
  if (!["reviewed", "offering", "repool"].includes(p.status)) return { ok: false, error: "offer.error.notReviewed" };
  if (!canIssueOffer(full.checks)) return { ok: false, error: "product.error.checksFailed" };
  if (!p.name_ko?.trim()) return { ok: false, error: "review.error.needKo" };

  const db = createAdminClient();
  const [{ data: brand }, { data: item }, { data: existing }] = await Promise.all([
    db.from("brands").select("id, slug, status, fee_rate, hidden_margin_rate").eq("id", v.brandId).maybeSingle(),
    v.requestItemId ? db.from("request_items").select("id, brand_id, request_id, target_price_krw, status").eq("id", v.requestItemId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("offers").select("brand_id, request_item_id, status, exclusive_until").eq("product_id", v.productId),
  ]);
  if (!brand || brand.status !== "active") return { ok: false, error: "common.notFound" };
  if (v.requestItemId && (!item || item.brand_id !== v.brandId)) return { ok: false, error: "common.forbidden" }; // 다른 브랜드 항목에 걸 수 없다
  if (item && !["assigned", "sourcing", "offered", "selected"].includes(item.status)) return { ok: false, error: "offer.error.itemClosed" };
  const now = new Date();
  const block = issueBlocker(existing ?? [], { brandId: v.brandId, requestItemId: v.requestItemId }, now);
  if (block) return { ok: false, error: block };

  const settings = await getSettings();
  const inh = resolveInherited(p, full.vendor);
  const fixed = computeOfferFixed({ costTiers: full.cost.tiers, weightG: p.weight_g, labels: inh.labelOptions, mods: inh.modOptions, brand, settings });
  // 희망 단가 대비 범위 초과면 브랜드용 코멘트 필수 (F4)
  const diff = targetDiffPct(item?.target_price_krw, supplyPriceKrw(fixed.price_tiers[0].product_price_krw, fixed.fee_rate));
  if (diff !== null && Math.abs(diff) > settings.target_diff_pct * 100 && !v.comment) return { ok: false, error: "offer.error.needComment" };

  const type = offerType(v.requestItemId, (existing ?? []).length);
  const dates = offerDates(type, now, settings);
  const { owner_role, due_at } = ownerAndDue("offer", "new", now, settings, { exclusive_until: dates.exclusive_until ? new Date(`${dates.exclusive_until}T23:59:59+09:00`) : null });
  // 최종 판정은 DB 함수가 상품 단위 잠금 안에서 (동시 발행 경쟁, 리뷰 8). 위 issueBlocker는 사용자에게 사유를 먼저 보여주는 사전 검사
  const { data: offerId, error } = await db.rpc("issue_offer_locked", {
    p: {
      product_id: v.productId, brand_id: v.brandId, request_item_id: v.requestItemId, type,
      ...fixed, ...dates, issued_by: admin.id, admin_comment: v.comment || null, owner_role, due_at: due_at?.toISOString() ?? null,
    },
  });
  if (error || !offerId) {
    const m = error?.message ?? "";
    return { ok: false, error: m.includes("offer_exclusive") ? "offer.error.exclusive" : m.includes("offer_duplicate") || error?.code === "23505" ? "offer.error.duplicate" : "common.error" };
  }
  const offer = { id: offerId as string };
  await db.from("audit_logs").insert({
    actor_id: admin.id, action: "offer.issue", entity: "offer", entity_id: offer.id,
    diff: { type, price_tiers: fixed.price_tiers, fee_rate: fixed.fee_rate, hidden_margin_rate: fixed.hidden_margin_rate, fx_rate: fixed.fx_rate, target_diff_pct: diff },
    on_behalf_of_brand_id: v.brandId,
  });
  // 항목 상태(offered)는 트리거가 바꾼다. owner/due를 SLA 규칙으로 다시 맞춘다.
  if (item && (item.status === "assigned" || item.status === "sourcing")) {
    const sla = ownerAndDue("request_item", "offered", now, settings, { exclusive_until: dates.exclusive_until ? new Date(`${dates.exclusive_until}T23:59:59+09:00`) : null });
    await db.from("request_items").update({ owner_role: sla.owner_role, due_at: sla.due_at?.toISOString() ?? null }).eq("id", item.id).eq("status", "offered");
    await db.from("audit_logs").insert({ actor_id: admin.id, action: "transition", entity: "request_item", entity_id: item.id, diff: { from: item.status, to: "offered" } });
  }
  await notify({ type: "offer.issued", brandId: v.brandId, brandSlug: brand.slug, requestId: item?.request_id ?? null });
  revalidatePath("/admin/offers", "page");
  revalidatePath("/admin/offers/[id]", "page");
  return { ok: true, data: { offerId: offer.id } };
}
