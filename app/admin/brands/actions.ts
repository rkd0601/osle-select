"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { notify, notifyInvite } from "@/lib/notify";
import { createInvite } from "@/app/(public)/invite/[token]/actions";

/**
 * A-07 브랜드 관리: 신청 승인(브랜드 생성 + owner 초대)·반려, 등급·수수료·숨은 마진(감사 로그 before/after — 절대 규칙 12),
 * 크레딧 수동 조정(원자 RPC), 정지·재개, 멤버 초대. 결제·세금계산서 없음(규칙 13).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => { revalidatePath("/admin/brands", "page"); revalidatePath("/admin/brands/[id]", "page"); };
const audit = (actorId: string, action: string, brandId: string, diff: Record<string, unknown>) =>
  createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, entity: "brand", entity_id: brandId, diff });

async function invite(brandId: string, brandName: string, email: string, level: "owner" | "member", canPurchase: boolean) {
  const r = await createInvite({ brandId, email, level, canPurchase });
  if (!r.ok) return r;
  const mail = await notifyInvite({ email, url: r.data.url, brandName });
  return { ok: true as const, data: { url: r.data.url, emailed: mail.ok } };
}

const Approve = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,40}$/), tier: z.enum(["new", "proven"]).default("new") });
export async function approveApplication(applicationId: string, input: unknown): Promise<Result<{ brandId: string; url: string; emailed: boolean; inviteFailed: boolean }>> {
  const parsed = Approve.safeParse(input);
  if (!Id.safeParse(applicationId).success || !parsed.success) return { ok: false, error: "admin.brands.error.slug" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: app } = await db.from("brand_applications").select("id, brand_name, type, channels, contact_email, status").eq("id", applicationId).maybeSingle();
  if (!app) return { ok: false, error: "common.notFound" };
  if (app.status !== "pending") return { ok: false, error: "common.staleState" };
  // 신청 선점 (두 관리자가 동시에 승인해도 브랜드 1개)
  const { data: claimed } = await db.from("brand_applications").update({ status: "approved", reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).eq("id", applicationId).eq("status", "pending").select("id");
  if (!claimed?.length) return { ok: false, error: "common.staleState" };
  const { data: brand, error } = await db.from("brands").insert({
    slug: parsed.data.slug, name: app.brand_name, type: app.type, tier: parsed.data.tier, channels: app.channels, approved_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !brand) {
    await db.from("brand_applications").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", applicationId);
    return { ok: false, error: error?.code === "23505" ? "admin.brands.error.slugTaken" : "common.error" };
  }
  await db.from("brand_applications").update({ created_brand_id: brand.id }).eq("id", applicationId);
  await audit(admin.id, "brand.approve", brand.id, { application_id: applicationId, tier: parsed.data.tier });
  const inv = await invite(brand.id, app.brand_name, app.contact_email, "owner", true);
  revalidate();
  // 브랜드는 이미 만들어졌다 — 초대만 실패했으면 승인은 성공으로 돌려주고 상세에서 다시 초대하게 한다 (리뷰 LOW-8)
  if (!inv.ok) return { ok: true, data: { brandId: brand.id, url: "", emailed: false, inviteFailed: true } };
  return { ok: true, data: { brandId: brand.id, url: inv.data.url, emailed: inv.data.emailed, inviteFailed: false } };
}

export async function rejectApplication(applicationId: string): Promise<Result<null>> {
  if (!Id.safeParse(applicationId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const { data } = await createAdminClient().from("brand_applications").update({ status: "rejected", reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).eq("id", applicationId).eq("status", "pending").select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  revalidate();
  return { ok: true, data: null };
}

const Rate = z.number().min(0).max(0.5).nullable();
const Terms = z.object({ tier: z.enum(["new", "proven"]), feeRate: Rate, hiddenMarginRate: Rate });
/** 등급·수수료·숨은 마진 (null = 설정 기본값). 이미 발행된 제안은 발행 시점 값이 고정이라 바뀌지 않는다(절대 규칙 3) */
export async function updateBrandTerms(brandId: string, input: unknown): Promise<Result<null>> {
  const parsed = Terms.safeParse(input);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: b } = await db.from("brands").select("tier, fee_rate, hidden_margin_rate").eq("id", brandId).maybeSingle();
  if (!b) return { ok: false, error: "common.notFound" };
  const next = { tier: parsed.data.tier, fee_rate: parsed.data.feeRate, hidden_margin_rate: parsed.data.hiddenMarginRate };
  const { error } = await db.from("brands").update({ ...next, updated_at: new Date().toISOString() }).eq("id", brandId);
  if (error) return { ok: false, error: "common.error" };
  await audit(admin.id, "brand.terms_update", brandId, { before: { tier: b.tier, fee_rate: b.fee_rate, hidden_margin_rate: b.hidden_margin_rate }, after: next });
  revalidate();
  return { ok: true, data: null };
}

const Credit = z.object({ amount: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0), reason: z.string().trim().min(1).max(200) });
/** 크레딧 수동 조정: +적립 / -차감(잔액까지만). 원자 RPC(0035) + 감사 로그(요청액·실제액) */
export async function adjustBrandCredit(brandId: string, input: unknown): Promise<Result<{ applied: number }>> {
  const parsed = Credit.safeParse(input);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { amount, reason } = parsed.data;
  const r = amount > 0 ? await db.rpc("credit_brand", { p_brand: brandId, p_amount: amount }) : await db.rpc("use_brand_credit", { p_brand: brandId, p_max: -amount });
  if (r.error) return { ok: false, error: "common.error" };
  const applied = amount > 0 ? amount : -Number(r.data ?? 0);
  await audit(admin.id, "brand.credit_adjust", brandId, { requested: amount, applied, reason });
  revalidate();
  return { ok: true, data: { applied } };
}

export async function setBrandStatus(brandId: string, status: unknown): Promise<Result<null>> {
  const s = z.enum(["active", "suspended"]).safeParse(status);
  if (!Id.safeParse(brandId).success || !s.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const { data } = await createAdminClient().from("brands").update({ status: s.data, updated_at: new Date().toISOString() }).eq("id", brandId).neq("status", s.data).select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(admin.id, "brand.status", brandId, { status: s.data });
  revalidate();
  return { ok: true, data: null };
}

const Invite = z.object({ email: z.string().trim().email().max(120), level: z.enum(["owner", "member"]), canPurchase: z.boolean() });
export async function inviteBrandMember(brandId: string, input: unknown): Promise<Result<{ url: string; emailed: boolean }>> {
  const parsed = Invite.safeParse(input);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const { data: b } = await createAdminClient().from("brands").select("name").eq("id", brandId).maybeSingle();
  if (!b) return { ok: false, error: "common.notFound" };
  const inv = await invite(brandId, b.name, parsed.data.email.toLowerCase(), parsed.data.level, parsed.data.level === "owner" || parsed.data.canPurchase);
  if (!inv.ok) return { ok: false, error: "admin.brands.error.invite" };
  await audit(admin.id, "brand.invite", brandId, { email: parsed.data.email.toLowerCase(), level: parsed.data.level });
  revalidate();
  return { ok: true, data: inv.data };
}

/** 브랜드 주소(slug) 변경 요청 승인·반려 (DECISIONS 9-8). 승인 = brands.slug 교체(유일) + 요청 닫기 + 감사 + 브랜드 멤버 즉시 알림 */
export async function decideSlugRequest(requestId: string, approve: boolean): Promise<Result<null>> {
  if (!Id.safeParse(requestId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: r } = await db.from("brand_change_requests").select("id, brand_id, value, status, brands(slug)").eq("id", requestId).maybeSingle();
  if (!r) return { ok: false, error: "common.notFound" };
  if (r.status !== "pending") return { ok: false, error: "common.staleState" };
  const from = ((Array.isArray(r.brands) ? r.brands[0] : r.brands) as { slug?: string } | null)?.slug ?? "";
  if (approve) {
    const { error } = await db.from("brands").update({ slug: r.value, updated_at: new Date().toISOString() }).eq("id", r.brand_id);
    if (error) return { ok: false, error: error.code === "23505" ? "admin.brands.error.slugTaken" : "common.error" };
  }
  const { data: closed } = await db.from("brand_change_requests").update({ status: approve ? "approved" : "rejected", decided_by: admin.id, decided_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending").select("id");
  if (!closed?.length) return { ok: false, error: "common.staleState" };
  await audit(admin.id, approve ? "brand.slug_change" : "brand.slug_reject", r.brand_id, { from, to: r.value, request_id: requestId });
  if (approve) await notify({ type: "brand.slug_changed", brandId: r.brand_id, brandSlug: r.value });
  revalidate();
  return { ok: true, data: null };
}
