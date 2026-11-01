"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getRejectionTemplates, getSettings } from "@/lib/db/settings";
import { getMyProduct } from "@/lib/db/cn/products";
import { notify } from "@/lib/notify";
import { translateWithCheck } from "@/lib/translate";
import { canRequestReview } from "@/lib/transitions";
import { resolveInherited } from "@/lib/products";
import { computeOfferFixed, isLive, statusAfterReapproval } from "@/lib/offers";

/**
 * A-03 상품 검수 = 품질만 (기획서 F4). 가격·브랜드는 다루지 않는다(A-04). 승인해도 브랜드에게는 아직 안 보인다.
 * 재확인 건 승인 시에만 걸린 제안을 다시 계산한다(D16): 가격이 같으면 이전 반응 복원, 다르면 재동의 대기.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = (id: string) => {
  revalidatePath("/admin/products", "page");
  revalidatePath("/admin/products/[id]", "page");
  revalidatePath("/cn/products/[id]", "page");
  revalidatePath("/admin", "page");
  void id;
};

const ADMIN_ACTOR = (id: string) => ({ id, role: "ADMIN" as const });

/** 번역 초안 + 역번역 검증 → translation_meta 저장. 원가 필드는 보내지 않는다(TranslateInput 타입). 초안은 저장하지 않고 돌려준다. */
export async function draftProductTranslation(productId: string): Promise<
  Result<{ nameKo: string; descKo: string; qualityNoteKo: string; colors: { id: string; nameKo: string }[]; meta: Record<string, unknown> }>
> {
  if (!Id.safeParse(productId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const full = admin && (await getMyProduct(ADMIN_ACTOR(admin.id), productId));
  if (!admin || !full) return { ok: false, error: "common.notFound" };
  const p = full.product;
  const segs = [
    { field: "product_name" as const, text: p.name_zh ?? "" },
    { field: "product_desc" as const, text: p.desc_zh ?? "" },
    { field: "quality_note" as const, text: p.quality_note_zh ?? "" },
    ...full.colors.map((c) => ({ field: "color_name" as const, text: c.name_zh ?? "" })),
  ];
  const res = await translateWithCheck({ from: "zh-CN", to: "ko", segments: segs });
  if (!res.ok) return res;
  const keys = ["name", "desc", "qualityNote", ...full.colors.map((c) => `color:${c.id}`)];
  const meta = { at: new Date().toISOString(), fields: Object.fromEntries(keys.map((k, i) => [k, res.data[i].check])) };
  await createAdminClient().from("products").update({ translation_meta: meta }).eq("id", productId);
  revalidate(productId);
  return {
    ok: true,
    data: {
      nameKo: res.data[0].text, descKo: res.data[1].text, qualityNoteKo: res.data[2].text,
      colors: full.colors.map((c, i) => ({ id: c.id, nameKo: res.data[3 + i].text })), meta,
    },
  };
}

const KoSchema = z.object({
  nameKo: z.string().trim().max(100),
  descKo: z.string().trim().max(2000).optional().or(z.literal("")),
  qualityNoteKo: z.string().trim().max(1000).optional().or(z.literal("")),
  showQualityNote: z.boolean(),
  colors: z.array(z.object({ id: Id, nameKo: z.string().trim().max(30) })).max(20),
});

/** 한국어 확정 문구 저장 (브랜드에게 보이는 유일한 텍스트) */
export async function saveProductKo(productId: string, input: unknown): Promise<Result<null>> {
  const parsed = KoSchema.safeParse(input);
  if (!Id.safeParse(productId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const v = parsed.data;
  const { data: colors } = await db.from("product_colors").select("id").eq("product_id", productId);
  const own = new Set((colors ?? []).map((c) => c.id));
  if (v.colors.some((c) => !own.has(c.id))) return { ok: false, error: "common.forbidden" };
  const { error } = await db.from("products").update({ name_ko: v.nameKo || null, desc_ko: v.descKo || null, quality_note_ko: v.qualityNoteKo || null, show_quality_note: v.showQualityNote }).eq("id", productId);
  if (error) return { ok: false, error: "common.error" };
  for (const c of v.colors) await db.from("product_colors").update({ name_ko: c.nameKo || null }).eq("id", c.id);
  revalidate(productId);
  return { ok: true, data: null };
}

/** 용어 사전 추가 (관리자가 넣으면 바로 승인) */
export async function addGlossaryTerm(input: unknown): Promise<Result<null>> {
  const parsed = z.object({ zh: z.string().trim().min(1).max(40), ko: z.string().trim().min(1).max(40), category: z.string().trim().max(30).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const { error } = await createAdminClient()
    .from("glossary")
    .upsert({ term_zh: parsed.data.zh, term_ko: parsed.data.ko, category: parsed.data.category || null, approved: true, added_by: admin.id }, { onConflict: "term_zh,term_ko" });
  return error ? { ok: false, error: "common.error" } : { ok: true, data: null };
}

/** 템플릿 반려 (pending_review → rejected). 사유는 settings.rejection_templates 코드만, 메모는 감사 로그·CN 알림. */
export async function rejectProduct(productId: string, input: unknown): Promise<Result<null>> {
  const parsed = z.object({ codes: z.array(z.string()).min(1).max(10), memo: z.string().trim().max(300).optional() }).safeParse(input);
  if (!Id.safeParse(productId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const templates = await getRejectionTemplates();
  if (parsed.data.codes.some((c) => !templates.some((t) => t.code === c))) return { ok: false, error: "common.invalid" };
  const db = createAdminClient();
  const { data: p } = await db.from("products").select("id, status, created_by").eq("id", productId).maybeSingle();
  if (!p) return { ok: false, error: "common.notFound" };
  const res = await applyTransition(db, {
    entity: "product", id: productId, from: p.status, to: "rejected", role: "ADMIN", actorId: admin.id, settings: await getSettings(),
    patch: { rejected_reasons: parsed.data.codes, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }, note: parsed.data.memo,
  });
  if (!res.ok) return res;
  if (p.created_by) await notify({ type: "product.rejected", productId, creatorId: p.created_by });
  revalidate(productId);
  return { ok: true, data: null };
}

/**
 * 승인. pending_review → reviewed (공개 조건 + 한국어 상품명). 원클릭.
 * recheck → (걸린 제안 재계산) → 살아 있는 제안이 있으면 offering, 없으면 reviewed.
 */
export async function approveProduct(productId: string): Promise<Result<{ repriced: number }>> {
  if (!Id.safeParse(productId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const full = admin && (await getMyProduct(ADMIN_ACTOR(admin.id), productId));
  if (!admin || !full) return { ok: false, error: "common.notFound" };
  const p = full.product;
  if (!canRequestReview(full.checks)) return { ok: false, error: "product.error.checksFailed" };
  if (!p.name_ko?.trim()) return { ok: false, error: "review.error.needKo" };
  const db = createAdminClient();
  const settings = await getSettings();
  const stamp = { reviewed_by: admin.id, reviewed_at: new Date().toISOString(), rejected_reasons: [], recheck_reason: null };

  if (p.status === "pending_review") {
    const res = await applyTransition(db, { entity: "product", id: productId, from: p.status, to: "reviewed", role: "ADMIN", actorId: admin.id, settings, patch: stamp });
    if (!res.ok) return res;
    if (p.created_by) await notify({ type: "product.approved", productId, creatorId: p.created_by });
    revalidate(productId);
    return { ok: true, data: { repriced: 0 } };
  }
  if (p.status !== "recheck") return { ok: false, error: "common.forbidden" };

  // 재확인: 걸린 제안을 현재 원가·환율·브랜드 요율로 다시 계산
  const { data: offers } = await db.from("offers").select("id, status, status_before_recheck, price_tiers, fee_rate, exclusive_until, brand_id, brands(fee_rate, hidden_margin_rate)").eq("product_id", productId).eq("status", "recheck");
  const inh = resolveInherited(p, full.vendor);
  let repriced = 0;
  for (const o of offers ?? []) {
    const brand = (Array.isArray(o.brands) ? o.brands[0] : o.brands) ?? { fee_rate: null, hidden_margin_rate: null };
    const fixed = computeOfferFixed({ costTiers: full.cost.tiers, weightG: p.weight_g, labels: inh.labelOptions, mods: inh.modOptions, brand, settings });
    const to = statusAfterReapproval({ status_before_recheck: o.status_before_recheck, price_tiers: o.price_tiers, fee_rate: o.fee_rate }, fixed.price_tiers, fixed.fee_rate);
    const patch = to === "reconsent_pending" ? { ...fixed, status_before_recheck: null } : { status_before_recheck: null };
    const r = await applyTransition(db, {
      entity: "offer", id: o.id, from: "recheck", to, role: "ADMIN", actorId: admin.id, settings, patch, onBehalfOfBrandId: null,
      ctx: { exclusive_until: o.exclusive_until ? new Date(`${o.exclusive_until}T23:59:59+09:00`) : null }, // 복원된 new는 원래 독점 종료일까지 (리뷰 6)
    });
    if (!r.ok) return r;
    if (to === "reconsent_pending") {
      repriced++;
      await db.from("audit_logs").insert({ actor_id: admin.id, action: "price.reprice", entity: "offer", entity_id: o.id, diff: { from: o.price_tiers, to: fixed.price_tiers } });
    }
  }
  const { data: live } = await db.from("offers").select("status").eq("product_id", productId);
  const to = (live ?? []).some((o) => isLive(o.status)) ? "offering" : "reviewed";
  const res = await applyTransition(db, { entity: "product", id: productId, from: "recheck", to, role: "ADMIN", actorId: admin.id, settings, patch: stamp });
  if (!res.ok) return res;
  if (p.created_by) await notify({ type: "product.approved", productId, creatorId: p.created_by });
  revalidate(productId);
  return { ok: true, data: { repriced } };
}

/** 비공개 처리 (검수완료·제안중·재제안 풀·반려 → hidden) */
export async function hideProduct(productId: string): Promise<Result<null>> {
  if (!Id.safeParse(productId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: p } = await db.from("products").select("status").eq("id", productId).maybeSingle();
  if (!p) return { ok: false, error: "common.notFound" };
  const settings = await getSettings();
  const res = await applyTransition(db, { entity: "product", id: productId, from: p.status, to: "hidden", role: "ADMIN", actorId: admin.id, settings });
  if (!res.ok) return res;
  // 걸린 살아 있는 제안은 만료 — 브랜드 반응·독점 차단이 남지 않게 (리뷰 7)
  const { data: live } = await db.from("offers").select("id, status").eq("product_id", productId).in("status", ["new", "interested", "hold", "recheck", "reconsent_pending"]);
  for (const o of live ?? []) await applyTransition(db, { entity: "offer", id: o.id, from: o.status, to: "expired", role: "ADMIN", actorId: admin.id, settings, note: "product_hidden" });
  revalidate(productId);
  return { ok: true, data: null };
}
