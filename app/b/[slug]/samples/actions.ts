"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess } from "@/lib/auth/guards";
import { applyFieldTransition, applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notifySampleCnOwners, resolveSampleLines } from "@/lib/db/admin/samples";
import { ownerAndDue } from "@/lib/sla";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";
import { exclusiveOnInterest, kstDay } from "@/lib/offers";
import { feedbackComplete, initialSampleStatus, needsInterestFirst, returnDue, sampleAmounts, sampleRequestSchema } from "@/lib/samples";

/**
 * B-06 샘플 요청서 · B-07 샘플 현황. 구매 행위(요청·취소)는 canPurchase 필요(절대 규칙 2·7, D10).
 * 금액은 서버가 중량(브랜드 비노출)으로 계산해 요청 시점에 고정한다. 결제 자동화 없음 — 입금 "신고"까지만 (절대 규칙 13).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => {
  revalidatePath("/b/[slug]/samples", "page");
  revalidatePath("/b/[slug]/samples/[id]", "page");
  revalidatePath("/b/[slug]/offers", "page");
};

/** B-06 실시간 금액 (물류비 한 금액 + 구매하면 더해질 구매가). 중량은 응답에 없다 */
export async function quoteSample(brandId: string, lines: unknown): Promise<Result<{ logistics: number; productTotal: number; origins: number }>> {
  const parsed = z.array(z.object({ offerId: Id, variantId: Id, qty: z.number().int().min(0).max(10) })).max(60).safeParse(lines);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  if (!(await requireBrandAccess(brandId))) return { ok: false, error: "common.notFound" };
  const active = parsed.data.filter((l) => l.qty > 0);
  if (!active.length) return { ok: true, data: { logistics: 0, productTotal: 0, origins: 0 } };
  const s = await getSettings();
  const r = await resolveSampleLines(brandId, active, s.sample_purchase_markup);
  if ("error" in r) return { ok: false, error: r.error! };
  const a = sampleAmounts(r.cost, s);
  return { ok: true, data: { logistics: a.logistics_fee_krw, productTotal: a.product_fee_total_krw, origins: r.origins } };
}

/** B-06 요청서 생성. 보류 제안은 같은 액션에서 관심으로 전이. v2(d-26): 등급과 관계없이 바로 출고 준비 — 물류비는 후불(다음 청구에 합산) */
export async function createSampleRequest(brandId: string, input: unknown): Promise<Result<{ sampleId: string }>> {
  if (!Id.safeParse(brandId).success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  if (!access.canPurchase) return { ok: false, error: "sample.error.noPurchase" };
  const s = await getSettings();
  const parsed = sampleRequestSchema(s.sample_qty_max).safeParse(input);
  if (!parsed.success) {
    const m = parsed.error.issues[0]?.message ?? "";
    return { ok: false, error: m.startsWith("sample.") ? m : "common.invalid" };
  }
  const lines = parsed.data.lines.filter((l) => l.qty > 0);
  const r = await resolveSampleLines(brandId, lines, s.sample_purchase_markup);
  if ("error" in r) return { ok: false, error: r.error! };
  const db = createAdminClient();

  // 보류 → 관심 (샘플 요청 = 관심 표시, DECISIONS r3 STEP6 Q1)
  for (const o of r.offers.filter((x) => needsInterestFirst(x.status))) {
    // 추천 제안을 보류했다가 샘플로 담으면 그 시점부터 독점 (DECISIONS r3 STEP5 Q5, r4 리뷰 5)
    const grant = exclusiveOnInterest(o.type, o.exclusive_until, "interested", new Date(), s.exclusive_days);
    const t = await applyTransition(db, {
      entity: "offer", id: o.id, from: o.status, to: "interested", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id, settings: s,
      patch: { reaction: "interested", reacted_by: access.actor.id, reacted_at: new Date().toISOString(), ...(grant ? { exclusive_until: grant } : {}) }, onBehalfOfBrandId: access.onBehalf ? brandId : null,
      ctx: { exclusive_until: grant ? new Date(`${grant}T23:59:59+09:00`) : o.exclusive_until ? new Date(`${o.exclusive_until}T23:59:59+09:00`) : null },
    });
    if (!t.ok) return t;
  }

  const status = initialSampleStatus();
  const amounts = sampleAmounts(r.cost, s);
  const now = new Date();
  const { owner_role, due_at } = ownerAndDue("sample_request", status, now, s);
  const { data: sr, error } = await db
    .from("sample_requests")
    .insert({
      brand_id: brandId, requested_by: access.actor.id, status, owner_role, due_at: due_at?.toISOString() ?? null, ship_to: parsed.data.shipTo,
      ...amounts, payment_required: false,
    })
    .select("id")
    .single();
  if (error || !sr) return { ok: false, error: "common.error" };
  const { error: ie } = await db.from("sample_items").insert(
    r.cost.map((c) => ({ sample_request_id: sr.id, brand_id: brandId, offer_id: c.offerId, variant_id: c.variantId, qty: c.qty, product_price_krw: c.product_price_krw })),
  );
  if (ie) {
    await db.from("sample_requests").delete().eq("id", sr.id);
    return { ok: false, error: "common.error" };
  }
  await db.from("audit_logs").insert({
    actor_id: access.actor.id, action: "sample.request", entity: "sample_request", entity_id: sr.id,
    diff: { status, ...amounts, lines: r.cost.map((c) => ({ offer: c.offerId, variant: c.variantId, qty: c.qty })) }, on_behalf_of_brand_id: access.onBehalf ? brandId : null,
  });
  // 수령 주소를 기본값으로 저장 (다음 요청서 자동 채움). **대표만**(설정과 같은 권한, d-31) — 멤버가 낸 요청서는 이번 주소로만 보낸다.
  // 기본 배송지가 없을 때 폼의 "기본 배송지로 저장"을 끄면 저장하지 않는다 (7차 W3)
  if (access.level === "owner" && parsed.data.saveDefault !== false) await db.from("brands").update({ default_address: parsed.data.shipTo }).eq("id", brandId);
  await notify({ type: "sample.requested", sampleId: sr.id, paymentRequired: false });
  await notifySampleCnOwners(sr.id);
  revalidate();
  return { ok: true, data: { sampleId: sr.id } };
}

async function loadOwnSample(brandId: string, sampleId: string) {
  const { data } = await createAdminClient().from("sample_requests").select("id, status, brand_id, payment_required, payment_confirmed_at").eq("id", sampleId).eq("brand_id", brandId).maybeSingle();
  return data;
}

/** "입금했어요" 신고 — 상태는 그대로, 관리자 확인 대기 (절대 규칙 13: 확인 플래그는 관리자) */
export async function reportPayment(brandId: string, sampleId: string, note: unknown): Promise<Result<null>> {
  const n = z.string().trim().max(100).optional().or(z.literal("")).safeParse(note);
  if (!Id.safeParse(brandId).success || !Id.safeParse(sampleId).success || !n.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const sr = access && (await loadOwnSample(brandId, sampleId));
  if (!access || !sr) return { ok: false, error: "common.notFound" };
  if (sr.status !== "awaiting_payment") return { ok: false, error: "common.staleState" };
  // 신고 후엔 관리자 차례 (상태는 그대로, 확인은 관리자) — 큐 담당 표시
  await createAdminClient().from("sample_requests").update({ payment_reported_at: new Date().toISOString(), payment_note: n.data || null, owner_role: "ADMIN" }).eq("id", sampleId);
  await notify({ type: "sample.payment_reported", sampleId });
  revalidate();
  return { ok: true, data: null };
}

export async function cancelSample(brandId: string, sampleId: string): Promise<Result<null>> {
  if (!Id.safeParse(brandId).success || !Id.safeParse(sampleId).success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const sr = access && (await loadOwnSample(brandId, sampleId));
  if (!access || !sr) return { ok: false, error: "common.notFound" };
  // 입금 확인 뒤에는 브랜드가 취소할 수 없다 — 관리자만(환불은 플랫폼 밖) (DECISIONS r4 #7)
  if (sr.payment_confirmed_at && access.actor.role !== "ADMIN") return { ok: false, error: "sample.error.paidCancel" };
  const res = await applyTransition(createAdminClient(), {
    entity: "sample_request", id: sampleId, from: sr.status, to: "cancelled", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id,
    settings: await getSettings(), onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}

/** 받았어요 (sent_to_brand → delivered) — 피드백 기한 시작 */
export async function markDelivered(brandId: string, sampleId: string): Promise<Result<null>> {
  if (!Id.safeParse(brandId).success || !Id.safeParse(sampleId).success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const sr = access && (await loadOwnSample(brandId, sampleId));
  if (!access || !sr) return { ok: false, error: "common.notFound" };
  const s = await getSettings();
  const now = new Date();
  const res = await applyTransition(createAdminClient(), {
    entity: "sample_request", id: sampleId, from: sr.status, to: "delivered", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id, settings: s,
    patch: { delivered_at: now.toISOString(), feedback_due: kstDay(new Date(now.getTime() + s.sample_feedback_days * 86400000)) }, onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}

const FeedbackSchema = z.object({
  feedback: z.enum(["interested", "hold", "declined"]),
  reason: z.enum(["price", "design", "fabric", "leadtime", "other"]).optional(),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

/**
 * variant별 피드백 → 제안 반응 동기화(트리거 sync_offer_reaction_from_sample, 0010). 모두 끝나면 feedback_done + 회수 기한.
 * 거절 메모는 B-04와 같이 zh로 번역해 CN에게(feedback_note_zh, v_sample_items_cn).
 */
export async function giveSampleFeedback(brandId: string, itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = FeedbackSchema.safeParse(input);
  if (!Id.safeParse(brandId).success || !Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const v = parsed.data;
  if (v.feedback === "declined" && !v.reason) return { ok: false, error: "offer.error.needReason" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: item } = await db.from("sample_items").select("id, status, offer_id, sample_request_id, sample_requests(status)").eq("id", itemId).eq("brand_id", brandId).maybeSingle();
  if (!item || item.status === "unavailable") return { ok: false, error: "common.notFound" };
  const srStatus = (Array.isArray(item.sample_requests) ? item.sample_requests[0] : item.sample_requests)?.status;
  if (srStatus !== "delivered" && srStatus !== "feedback_done") return { ok: false, error: "common.staleState" };
  let noteZh: string | null = null;
  if (v.note) {
    const tr = await translate({ from: "ko", to: "zh-CN", segments: [{ field: "decline_note", text: v.note }] });
    noteZh = tr.ok ? tr.data[0] : null;
  }
  const { error } = await db.from("sample_items").update({ feedback: v.feedback, feedback_reason: v.feedback === "declined" ? v.reason : null, feedback_note: v.note || null, feedback_note_zh: noteZh, feedback_by: access.actor.id }).eq("id", itemId);
  if (error) return { ok: false, error: "common.error" };
  if (v.feedback === "interested") {
    // 만료된 제안은 트리거가 상태를 바꾸지 않는다 → 재제안이 필요하다고 관리자에게 (r4 #6)
    const { data: offer } = await db.from("offers").select("status").eq("id", item.offer_id).maybeSingle();
    if (offer?.status === "expired") await notify({ type: "offer.expired_with_feedback", sampleId: item.sample_request_id });
  }
  const { data: all } = await db.from("sample_items").select("feedback, status").eq("sample_request_id", item.sample_request_id);
  if (srStatus === "delivered" && feedbackComplete(all ?? [])) {
    const s = await getSettings();
    const r = await applyTransition(db, {
      entity: "sample_request", id: item.sample_request_id, from: "delivered", to: "feedback_done", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id,
      settings: s, patch: { return_due: returnDue(new Date(), s.sample_return_days) }, onBehalfOfBrandId: access.onBehalf ? brandId : null,
    });
    if (r.ok) await notify({ type: "sample.feedback_done", sampleId: item.sample_request_id });
  }
  revalidate();
  return { ok: true, data: null };
}

/** 돌려보내기(반납 운송장) 또는 구매 선택(d-27 — 청구 합산은 관리자가 확정) */
export async function setSampleReturn(brandId: string, itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = z.union([z.object({ mode: z.literal("return"), tracking: z.string().trim().min(4).max(40) }), z.object({ mode: z.literal("keep") })]).safeParse(input);
  if (!Id.safeParse(brandId).success || !Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  // 구매 = 구매가 청구로 이어지는 구매 행위 (6단계 리뷰 6)
  if (parsed.data.mode === "keep" && !access.canPurchase) return { ok: false, error: "sample.error.noPurchase" };
  const { data: item } = await db.from("sample_items").select("id, status, return_status, charge_status, sample_requests(status)").eq("id", itemId).eq("brand_id", brandId).maybeSingle();
  if (!item || item.status === "unavailable") return { ok: false, error: "common.notFound" };
  const srStatus = (Array.isArray(item.sample_requests) ? item.sample_requests[0] : item.sample_requests)?.status;
  if (!["delivered", "feedback_done"].includes(srStatus ?? "") || item.return_status === "returned" || item.charge_status !== "none") return { ok: false, error: "common.staleState" };
  const to = parsed.data.mode === "return" ? "due" : "kept";
  const patch = parsed.data.mode === "return"
    ? { return_tracking: parsed.data.tracking, return_requested_at: new Date().toISOString() }
    : { return_tracking: null, return_requested_at: null };
  const onBehalfOfBrandId = access.onBehalf ? brandId : null;
  if (item.return_status === to) {
    // 반납 운송장 정정(due → due)은 전이가 아니다
    await db.from("sample_items").update(patch).eq("id", itemId).eq("return_status", to);
    await db.from("audit_logs").insert({ actor_id: access.actor.id, action: `sample.${parsed.data.mode}`, entity: "sample_item", entity_id: itemId, on_behalf_of_brand_id: onBehalfOfBrandId });
  } else {
    const t = await applyFieldTransition(db, {
      entity: "sample_item_return", ids: [itemId], from: item.return_status, to, role: access.actor.role, canPurchase: access.canPurchase,
      actorId: access.actor.id, patch, onBehalfOfBrandId, diff: { mode: parsed.data.mode },
    });
    if (!t.ok) return t;
  }
  revalidate();
  return { ok: true, data: null };
}
