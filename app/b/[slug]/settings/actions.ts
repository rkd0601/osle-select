"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess, type BrandAccess } from "@/lib/auth/guards";
import { createInvite } from "@/app/(public)/invite/[token]/actions";
import { notify, notifyInvite } from "@/lib/notify";
import { ShipTo } from "@/lib/samples";
import { slugCoolingDown } from "@/lib/db/admin/brands";

/**
 * B-10 브랜드 설정. 멤버 초대·발주 권한·내보내기·기본 배송지·주소 변경 요청은 owner만(ADMIN 대행은 owner로 본다),
 * digest 수신은 본인만(DECISIONS r6-2 — instant는 끌 수 없다). 서비스 롤로 쓰므로 brand_id·대상 멤버를 코드에서 다시 확인한다(절대 규칙 2).
 * 대행 행위는 감사 로그 on_behalf_of_brand_id(규칙 12).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const audit = (a: BrandAccess, action: string, diff: Record<string, unknown>) =>
  createAdminClient().from("audit_logs").insert({ actor_id: a.actor.id, action, entity: "brand", entity_id: a.brandId, diff, on_behalf_of_brand_id: a.onBehalf ? a.brandId : null });
const done = () => revalidatePath("/b/[slug]/settings", "page");

async function owner(brandId: string) {
  if (!Id.safeParse(brandId).success) return null;
  const a = await requireBrandAccess(brandId);
  return a && a.level === "owner" ? a : null;
}

const Invite = z.object({ email: z.string().trim().email().max(120), canPurchase: z.boolean().default(false) });
export async function inviteMember(brandId: string, input: unknown): Promise<Result<{ url: string; emailed: boolean }>> {
  const p = Invite.safeParse(input);
  if (!p.success) return { ok: false, error: "common.invalid" };
  const a = await owner(brandId);
  if (!a) return { ok: false, error: "bsettings.ownerOnly" };
  const email = p.data.email.toLowerCase();
  // 같은 이메일에 수락 대기 초대가 있으면 중복 발송하지 않는다 (r8 LOW-5)
  const { data: pending } = await createAdminClient().from("brand_invites").select("id")
    .eq("brand_id", brandId).ilike("email", email).is("accepted_at", null).gt("expires_at", new Date().toISOString()).limit(1);
  if (pending && pending.length) return { ok: false, error: "bsettings.error.alreadyInvited" };
  const r = await createInvite({ brandId, email, level: "member", canPurchase: p.data.canPurchase });
  if (!r.ok) return { ok: false, error: "bsettings.error.invite" };
  const { data: b } = await createAdminClient().from("brands").select("name").eq("id", brandId).maybeSingle();
  const mail = await notifyInvite({ email, url: r.data.url, brandName: b?.name ?? "" });
  await audit(a, "brand.invite", { email, level: "member", can_purchase: p.data.canPurchase });
  done();
  return { ok: true, data: { url: r.data.url, emailed: mail.ok } };
}

/** 대상이 이 브랜드의 일반 멤버인지 (owner·자기 자신은 여기서 못 바꾼다) */
async function targetMember(a: BrandAccess, profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Id.safeParse(profileId).success) return { ok: false, error: "common.invalid" };
  if (profileId === a.actor.id) return { ok: false, error: "bsettings.error.self" };
  const { data: m } = await createAdminClient().from("brand_members").select("level").eq("brand_id", a.brandId).eq("profile_id", profileId).maybeSingle();
  if (!m) return { ok: false, error: "common.notFound" };
  if (m.level === "owner") return { ok: false, error: "bsettings.error.owner" };
  return { ok: true };
}

export async function setMemberPurchase(brandId: string, profileId: string, canPurchase: boolean): Promise<Result<null>> {
  const a = await owner(brandId);
  if (!a) return { ok: false, error: "bsettings.ownerOnly" };
  const t = await targetMember(a, profileId);
  if (!t.ok) return t;
  const { error } = await createAdminClient().from("brand_members").update({ can_purchase: !!canPurchase }).eq("brand_id", brandId).eq("profile_id", profileId).eq("level", "member");
  if (error) return { ok: false, error: "common.error" };
  await audit(a, "brand.member_update", { profile_id: profileId, can_purchase: !!canPurchase });
  done();
  return { ok: true, data: null };
}

export async function removeMember(brandId: string, profileId: string): Promise<Result<null>> {
  const a = await owner(brandId);
  if (!a) return { ok: false, error: "bsettings.ownerOnly" };
  const t = await targetMember(a, profileId);
  if (!t.ok) return t;
  const { data } = await createAdminClient().from("brand_members").delete().eq("brand_id", brandId).eq("profile_id", profileId).eq("level", "member").select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(a, "brand.member_remove", { profile_id: profileId });
  done();
  return { ok: true, data: null };
}

export async function updateDefaultAddress(brandId: string, input: unknown): Promise<Result<null>> {
  const p = ShipTo.safeParse(input);
  if (!p.success) return { ok: false, error: "common.invalid" };
  const a = await owner(brandId);
  if (!a) return { ok: false, error: "bsettings.ownerOnly" };
  const { error } = await createAdminClient().from("brands").update({ default_address: p.data }).eq("id", brandId);
  if (error) return { ok: false, error: "common.error" };
  await audit(a, "brand.address_update", {}); // 주소 자체는 로그에 남기지 않는다(개인정보)
  done();
  return { ok: true, data: null };
}

/** digest 수신 — 본인 프로필만. 관리자 대행 중에는 바꾸지 않는다(멤버 본인의 선택) */
export async function setDigest(brandId: string, on: boolean): Promise<Result<null>> {
  if (!Id.safeParse(brandId).success) return { ok: false, error: "common.invalid" };
  const a = await requireBrandAccess(brandId);
  if (!a) return { ok: false, error: "common.notFound" };
  if (a.onBehalf) return { ok: false, error: "bsettings.digestOnBehalf" };
  const { error } = await createAdminClient().from("profiles").update({ notify_digest: !!on }).eq("id", a.actor.id);
  if (error) return { ok: false, error: "common.error" };
  done();
  return { ok: true, data: null };
}

const Slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/);
/** 주소(slug) 변경 요청 → 관리자 승인 (DECISIONS 9-8). 브랜드당 대기 1건(0046 부분 유일 인덱스) */
export async function requestSlugChange(brandId: string, value: unknown): Promise<Result<null>> {
  const p = Slug.safeParse(value);
  if (!p.success) return { ok: false, error: "bsettings.error.slug" };
  const a = await owner(brandId);
  if (!a) return { ok: false, error: "bsettings.ownerOnly" };
  const db = createAdminClient();
  const { data: b } = await db.from("brands").select("slug, name").eq("id", brandId).maybeSingle();
  if (!b) return { ok: false, error: "common.notFound" };
  if (b.slug === p.data) return { ok: false, error: "bsettings.error.slugSame" };
  const { data: taken } = await db.from("brands").select("id").eq("slug", p.data).maybeSingle();
  if (taken || (await slugCoolingDown(p.data, brandId))) return { ok: false, error: "bsettings.error.slugTaken" }; // 쿨다운 중인 주소도 "이미 쓰는 주소"로 — 다른 브랜드의 옛 주소라는 사실을 드러내지 않는다
  const { error } = await db.from("brand_change_requests").insert({ brand_id: brandId, kind: "slug", value: p.data, requested_by: a.actor.id });
  if (error) return { ok: false, error: error.code === "23505" ? "bsettings.error.pending" : "common.error" };
  await audit(a, "brand.slug_request", { from: b.slug, to: p.data });
  await notify({ type: "brand.slug_requested", brandId, brandName: b.name, value: p.data });
  done();
  return { ok: true, data: null };
}

export async function cancelSlugRequest(brandId: string): Promise<Result<null>> {
  const a = await owner(brandId);
  if (!a) return { ok: false, error: "bsettings.ownerOnly" };
  const { data } = await createAdminClient().from("brand_change_requests").update({ status: "cancelled", decided_by: a.actor.id, decided_at: new Date().toISOString() })
    .eq("brand_id", brandId).eq("kind", "slug").eq("status", "pending").select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(a, "brand.slug_request_cancel", {});
  done();
  return { ok: true, data: null };
}
