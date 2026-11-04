import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * B-10 설정 화면 데이터 (브랜드 세션 RLS만). 멤버 이름·이메일은 호출부가 여기서 받은 멤버 id로 lib/db/users#memberDirectory를 부른다.
 * 초대 목록은 owner만 보인다(0007 정책) — 멤버에게는 빈 목록.
 */
export async function loadBrandSettings(brandId: string, userId: string) {
  const supabase = await createClient();
  const [{ data: members }, { data: invites }, { data: brand }, { data: requests }, { data: me }] = await Promise.all([
    supabase.from("brand_members").select("profile_id, level, can_purchase, joined_at").eq("brand_id", brandId).order("joined_at"),
    supabase.from("brand_invites").select("id, email, can_purchase, expires_at").eq("brand_id", brandId).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    supabase.from("brands").select("slug, default_address").eq("id", brandId).maybeSingle(),
    supabase.from("brand_change_requests").select("id, value, status, created_at").eq("brand_id", brandId).eq("status", "pending").limit(1),
    supabase.from("profiles").select("notify_digest").eq("id", userId).maybeSingle(),
  ]);
  return {
    members: (members ?? []).map((m) => ({ profileId: m.profile_id as string, level: m.level as "owner" | "member", canPurchase: !!m.can_purchase })),
    invites: invites ?? [],
    slug: (brand?.slug ?? "") as string,
    address: (brand?.default_address ?? null) as { name?: string; phone?: string; address?: string; memo?: string } | null,
    pendingSlug: (requests?.[0]?.value ?? null) as string | null,
    digest: me?.notify_digest !== false,
  };
}

/** 지금 멤버 id (작성자 "(전 멤버)" 판정, r8-4) */
export async function brandMemberIds(brandId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("brand_members").select("profile_id").eq("brand_id", brandId);
  return new Set((data ?? []).map((m) => m.profile_id as string));
}
