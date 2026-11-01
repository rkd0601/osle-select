"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/config";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const TokenSchema = z.string().regex(/^[0-9a-f]{48}$/);

export type InvitePreview = { brandName: string; brandSlug: string; email: string; invitedByName: string | null; level: "owner" | "member" };

/** 초대 미리보기: 토큰 → 브랜드명·이메일. 서비스 롤로 조회(anon 권한 없음). 만료·수락됨은 invalid. */
export async function getInvitePreview(token: string): Promise<Result<InvitePreview>> {
  if (!TokenSchema.safeParse(token).success) return { ok: false, error: "invite.invalid" };
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_invites")
    .select("email, level, invited_by_name, expires_at, accepted_at, brands(name, slug)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.accepted_at || new Date(data.expires_at) < new Date()) return { ok: false, error: "invite.invalid" };
  const brand = Array.isArray(data.brands) ? data.brands[0] : (data.brands as { name: string; slug: string } | null);
  if (!brand) return { ok: false, error: "invite.invalid" };
  return { ok: true, data: { brandName: brand.name, brandSlug: brand.slug, email: data.email, invitedByName: data.invited_by_name, level: data.level } };
}

const AcceptSchema = z.object({
  token: TokenSchema,
  displayName: z.string().trim().min(1).max(40),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  agreed: z.literal(true),
});

/**
 * 초대 수락. 로그인된 사용자의 이메일이 초대 이메일과 같아야 한다.
 * 1) app_metadata.role = BRAND_OWNER|BRAND_MEMBER (JWT 역할, 서비스 롤로만 가능)
 * 2) profiles upsert  3) brand_members insert  4) invite accepted
 * 호출 후 클라이언트는 refreshSession()으로 새 JWT를 받아야 RLS에 역할이 반영된다.
 */
export async function acceptInvite(input: z.infer<typeof AcceptSchema>): Promise<Result<{ slug: string }>> {
  const parsed = AcceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invite.invalid" };
  const { token, displayName, phone } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) return { ok: false, error: "login.error.generic" };

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("brand_invites")
    .select("id, brand_id, email, level, can_purchase, expires_at, accepted_at, brands(slug)")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) return { ok: false, error: "invite.invalid" };
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) return { ok: false, error: "invite.emailMismatch" };

  const role: Role = inv.level === "owner" ? "BRAND_OWNER" : "BRAND_MEMBER";
  const currentRole = user.app_metadata?.role as string | undefined;
  // 이미 다른 역할(ADMIN/CN)이면 브랜드 역할로 덮어쓰지 않는다
  if (currentRole && currentRole !== role && !currentRole.startsWith("BRAND")) return { ok: false, error: "invite.invalid" };

  const { error: e1 } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role } });
  if (e1) return { ok: false, error: "login.error.generic" };
  const { error: e2 } = await admin.from("profiles").upsert({ id: user.id, display_name: displayName, phone: phone || null, locale: "ko" });
  if (e2) return { ok: false, error: "login.error.generic" };
  const { error: e3 } = await admin
    .from("brand_members")
    .upsert({ brand_id: inv.brand_id, profile_id: user.id, level: inv.level, can_purchase: inv.can_purchase || inv.level === "owner" }, { onConflict: "brand_id,profile_id" });
  if (e3) return { ok: false, error: "login.error.generic" };
  await admin.from("brand_invites").update({ accepted_at: new Date().toISOString(), accepted_profile_id: user.id }).eq("id", inv.id);
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "invite.accept", entity: "brand_invites", entity_id: inv.id, on_behalf_of_brand_id: inv.brand_id });

  const brand = Array.isArray(inv.brands) ? inv.brands[0] : (inv.brands as { slug: string } | null);
  return { ok: true, data: { slug: brand?.slug ?? "" } };
}

/**
 * 초대 생성 (A-07 / B-10에서 호출). ADMIN 또는 해당 브랜드 owner.
 * 초대 메일 발송은 notify()가 붙는 8단계에서. 지금은 링크를 반환한다.
 */
const CreateSchema = z.object({
  brandId: z.string().uuid(),
  email: z.string().email(),
  level: z.enum(["owner", "member"]).default("member"),
  canPurchase: z.boolean().default(false),
});
export async function createInvite(input: z.infer<typeof CreateSchema>): Promise<Result<{ url: string }>> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient(); // 사용자 세션 → RLS가 ADMIN/owner 여부를 강제
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "login.error.generic" };
  const { data: p } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
  const { data, error } = await supabase
    .from("brand_invites")
    .insert({ brand_id: parsed.data.brandId, email: parsed.data.email.toLowerCase(), level: parsed.data.level, can_purchase: parsed.data.canPurchase, invited_by: auth.user.id, invited_by_name: p?.display_name ?? null })
    .select("token")
    .single();
  if (error || !data) return { ok: false, error: "forbidden" };
  // 초대받는 사람이 OTP 로그인할 수 있도록 Auth 사용자를 미리 만든다(shouldCreateUser=false 정책). 이미 있으면 무시.
  const admin = createAdminClient();
  await admin.auth.admin.createUser({ email: parsed.data.email.toLowerCase(), email_confirm: true }).catch(() => null);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { ok: true, data: { url: `${base}/invite/${data.token}` } };
}
