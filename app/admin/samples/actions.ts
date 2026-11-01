"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notifySampleCnOwners } from "@/lib/db/admin/samples";
import { notify } from "@/lib/notify";
import { pathsExist, signedUploadUrl } from "@/lib/storage";
import { allResolved, chargeAmount, feedbackOverdue, returnDue, returnOverdue, SAMPLE_DEFECTS } from "@/lib/samples";
import { measurementErrors } from "@/lib/products";

/**
 * A-05 샘플 관리. 입금 확인·미회수 확정은 돈과 관련된 확인 단계 — 감사 로그 필수(절대 규칙 12). 결제 자동화 없음(규칙 13).
 * 상태 변경은 applyTransition만.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => {
  revalidatePath("/admin/samples", "page");
  revalidatePath("/admin/samples/[id]", "page");
  revalidatePath("/b/[slug]/samples/[id]", "page");
  revalidatePath("/cn/tasks", "page");
};

async function loadSample(id: string) {
  const { data } = await createAdminClient().from("sample_requests").select("id, status, brand_id, payment_required, payment_confirmed_at, logistics_fee_krw, brands(slug)").eq("id", id).maybeSingle();
  return data;
}
const slugOf = (sr: { brands: unknown }) => ((Array.isArray(sr.brands) ? sr.brands[0] : sr.brands) as { slug?: string } | null)?.slug ?? "";

async function step(sampleId: string, to: string, patch: Record<string, unknown> = {}): Promise<Result<null>> {
  const admin = await requireAdmin();
  const sr = admin && (await loadSample(sampleId));
  if (!admin || !sr) return { ok: false, error: "common.notFound" };
  const res = await applyTransition(createAdminClient(), { entity: "sample_request", id: sampleId, from: sr.status, to, role: "ADMIN", actorId: admin.id, settings: await getSettings(), patch });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}

/** 입금 확인 → 출고 준비(requested). 감사 로그 payment.confirm (DECISIONS r3 STEP6) */
export async function confirmSamplePayment(sampleId: string): Promise<Result<null>> {
  if (!Id.safeParse(sampleId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const sr = admin && (await loadSample(sampleId));
  if (!admin || !sr) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const res = await applyTransition(db, {
    entity: "sample_request", id: sampleId, from: sr.status, to: "requested", role: "ADMIN", actorId: admin.id, settings: await getSettings(),
    patch: { payment_confirmed_at: new Date().toISOString() },
  });
  if (!res.ok) return res;
  // 대행이 아니라 관리자 고유 행위 — brand_id는 diff에 (on_behalf는 대행 기록용, 6단계 리뷰 7)
  await db.from("audit_logs").insert({ actor_id: admin.id, action: "payment.confirm", entity: "sample_request", entity_id: sampleId, diff: { amount_krw: sr.logistics_fee_krw, brand_id: sr.brand_id } });
  await notifySampleCnOwners(sampleId);
  revalidate();
  return { ok: true, data: null };
}

export const markSampleArrived = async (sampleId: string) => (Id.safeParse(sampleId).success ? step(sampleId, "kr_arrived", { kr_arrived_at: new Date().toISOString() }) : { ok: false as const, error: "common.invalid" });

/** 검품 사진 업로드 URL (sample-photos 버킷) */
export async function issueSamplePhotoUpload(itemId: string): Promise<Result<{ path: string; token: string }>> {
  if (!Id.safeParse(itemId).success) return { ok: false, error: "common.invalid" };
  if (!(await requireAdmin())) return { ok: false, error: "common.notFound" };
  const s = await signedUploadUrl("samplePhotos", `${itemId}/${randomUUID()}.webp`);
  return s ? { ok: true, data: s } : { ok: false, error: "upload.failed" };
}

const InspectSchema = z.object({
  status: z.enum(["ok", "defect", "unavailable"]),
  defect: z.enum(SAMPLE_DEFECTS).optional().nullable(),
  photoPath: z.string().max(200).optional().nullable(),
  noteInternal: z.string().trim().max(500).optional().or(z.literal("")),
  measured: z.object({ sizeId: Id, measurements: z.record(z.string(), z.number()) }).optional().nullable(),
});

/** variant별 검품 (OK/불량 템플릿 + 사진 1장 + 실측 보완 → product_sizes.source=measured). 모두 끝나면 inspected */
export async function inspectSampleItem(itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = InspectSchema.safeParse(input);
  if (!Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const v = parsed.data;
  if (v.status === "defect" && !v.defect) return { ok: false, error: "sample.error.needDefect" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: item } = await db.from("sample_items").select("id, sample_request_id, offer_id, variant_id").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, error: "common.notFound" };
  const sr = await loadSample(item.sample_request_id);
  if (!sr || sr.status !== "kr_arrived") return { ok: false, error: "common.staleState" };
  if (v.photoPath && (!v.photoPath.startsWith(`${itemId}/`) || !(await pathsExist("samplePhotos", [v.photoPath])))) return { ok: false, error: "upload.missing" };
  if (v.measured) {
    if (measurementErrors(v.measured.measurements).length) return { ok: false, error: "product.error.measurement" };
    const { data: variant } = await db.from("product_variants").select("product_id, size_id").eq("id", item.variant_id).maybeSingle();
    if (!variant || variant.size_id !== v.measured.sizeId) return { ok: false, error: "common.forbidden" };
    await db.from("product_sizes").update({ measurements: v.measured.measurements, source: "measured" }).eq("id", v.measured.sizeId).eq("product_id", variant.product_id);
    await db.from("audit_logs").insert({ actor_id: admin.id, action: "product.measured", entity: "product_size", entity_id: v.measured.sizeId, diff: v.measured.measurements });
  }
  await db.from("sample_items").update({
    status: v.status, inspection_defect: v.status === "defect" ? v.defect : null, inspection_photo_path: v.photoPath ?? null,
    inspection_note_internal: v.noteInternal || null, inspected_at: new Date().toISOString(),
  }).eq("id", itemId);
  const { data: all } = await db.from("sample_items").select("status").eq("sample_request_id", item.sample_request_id);
  if ((all ?? []).every((i) => i.status !== "pending")) {
    await applyTransition(db, { entity: "sample_request", id: item.sample_request_id, from: "kr_arrived", to: "inspected", role: "ADMIN", actorId: admin.id, settings: await getSettings(), patch: { inspected_at: new Date().toISOString() } });
  }
  revalidate();
  return { ok: true, data: null };
}

/** 브랜드 발송 (운송장) */
export async function sendSampleToBrand(sampleId: string, tracking: string): Promise<Result<null>> {
  if (!Id.safeParse(sampleId).success || !z.string().trim().min(4).max(40).safeParse(tracking).success) return { ok: false, error: "common.invalid" };
  const sr = await loadSample(sampleId);
  const r = await step(sampleId, "sent_to_brand", { kr_tracking: tracking.trim(), sent_at: new Date().toISOString() });
  if (r.ok && sr) await notify({ type: "sample.sent", brandId: sr.brand_id, brandSlug: slugOf(sr), sampleId });
  return r;
}

/** 회수 접수 (반납 도착) → 샘플 라이브러리 보관 위치 */
export async function confirmSampleReturned(itemId: string, location: string): Promise<Result<null>> {
  if (!Id.safeParse(itemId).success || !z.string().trim().max(60).safeParse(location).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: item } = await db.from("sample_items").select("id, status, charge_status, sample_request_id").eq("id", itemId).maybeSingle();
  if (!item || item.charge_status !== "none" || item.status === "unavailable") return { ok: false, error: "common.staleState" };
  const srr = await loadSample(item.sample_request_id);
  if (!srr || !["delivered", "feedback_done"].includes(srr.status)) return { ok: false, error: "common.staleState" };
  await db.from("sample_items").update({ return_status: "returned", returned_at: new Date().toISOString(), library_location: location.trim() || null }).eq("id", itemId);
  await db.from("audit_logs").insert({ actor_id: admin.id, action: "sample.returned", entity: "sample_item", entity_id: itemId, diff: { location } });
  revalidate();
  return { ok: true, data: null };
}

/** 미회수 확정 (수동, DECISIONS r3 STEP6 Q4): 보유 + 상품가 청구 + 브랜드 알림 + 감사 로그. 발주 시 1회 차감(7단계) */
export async function confirmSampleUnreturned(itemId: string): Promise<Result<{ charged: number }>> {
  if (!Id.safeParse(itemId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: item } = await db.from("sample_items").select("id, sample_request_id, brand_id, qty, status, product_price_krw, return_status, charge_status, return_requested_at").eq("id", itemId).maybeSingle();
  if (!item || item.status === "unavailable" || item.return_status === "returned" || item.charge_status !== "none") return { ok: false, error: "common.staleState" };
  // 받은 뒤에만, 그리고 브랜드가 보유를 골랐거나 회수 기한이 지났을 때만 (반납 운송 중이면 불가) — 6단계 리뷰 5
  const { data: srq } = await db.from("sample_requests").select("status, return_due").eq("id", item.sample_request_id).maybeSingle();
  if (!srq || !["delivered", "feedback_done"].includes(srq.status)) return { ok: false, error: "common.staleState" };
  if (item.return_status !== "kept" && !returnOverdue(item, srq.return_due, new Date())) return { ok: false, error: "sample.error.notOverdue" };
  const charged = chargeAmount(item);
  const { data: upd } = await db.from("sample_items").update({ return_status: "kept", charge_status: "charged", charged_krw: charged, charged_at: new Date().toISOString() }).eq("id", itemId).eq("charge_status", "none").select("id");
  if (!upd?.length) return { ok: false, error: "common.staleState" };
  await db.from("audit_logs").insert({ actor_id: admin.id, action: "sample.charge", entity: "sample_item", entity_id: itemId, diff: { charged_krw: charged, brand_id: item.brand_id } });
  const sr = await loadSample(item.sample_request_id);
  if (sr) await notify({ type: "sample.charged", brandId: sr.brand_id, brandSlug: slugOf(sr), sampleId: sr.id });
  revalidate();
  return { ok: true, data: { charged } };
}

/** 닫기: 모든 항목이 반납 또는 청구 확정 */
export async function closeSample(sampleId: string): Promise<Result<null>> {
  if (!Id.safeParse(sampleId).success) return { ok: false, error: "common.invalid" };
  const { data: items } = await createAdminClient().from("sample_items").select("return_status, charge_status, status").eq("sample_request_id", sampleId);
  if (!allResolved(items ?? [])) return { ok: false, error: "sample.error.unresolved" };
  return step(sampleId, "closed");
}

/** 피드백 기한 경과 → 관리자가 피드백 단계를 닫고 회수 기한 시작 (브랜드가 피드백을 안 해서 영원히 delivered에 머무는 것 방지, 리뷰 3) */
export async function closeSampleFeedback(sampleId: string): Promise<Result<null>> {
  if (!Id.safeParse(sampleId).success) return { ok: false, error: "common.invalid" };
  const { data: sr } = await createAdminClient().from("sample_requests").select("status, feedback_due").eq("id", sampleId).maybeSingle();
  if (!sr || sr.status !== "delivered" || !feedbackOverdue(sr.feedback_due, new Date())) return { ok: false, error: "common.staleState" };
  const s = await getSettings();
  return step(sampleId, "feedback_done", { return_due: returnDue(new Date(), s.sample_return_days) });
}

export const adminCancelSample = async (sampleId: string) => (Id.safeParse(sampleId).success ? step(sampleId, "cancelled") : { ok: false as const, error: "common.invalid" });
