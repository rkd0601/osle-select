import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBrandRole, isCnRole, type Role } from "@/lib/config";
import { parseRole } from "./session";

/**
 * Server Action용 권한 확인. 페이지 가드(session.ts)와 달리 redirect/notFound 대신 null을 돌려준다.
 * 역할은 JWT app_metadata.role(getUser는 Auth 서버 검증). 브랜드 멤버십은 서비스 롤로 직접 확인한다
 * (액션은 서비스 롤로 쓰므로 RLS에 기대지 않고 코드에서 brand_id를 다시 검사한다 — 이중 방어).
 */
export type Actor = { id: string; role: Role };

export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const role = parseRole(data.user?.app_metadata?.role);
  return data.user && role ? { id: data.user.id, role } : null;
}

export async function requireActor(allowed: (r: Role) => boolean): Promise<Actor | null> {
  const a = await getActor();
  return a && allowed(a.role) ? a : null;
}
export const requireAdmin = () => requireActor((r) => r === "ADMIN");
export const requireCn = () => requireActor((r) => isCnRole(r) || r === "ADMIN");

export type BrandAccess = { actor: Actor; brandId: string; level: "owner" | "member"; canPurchase: boolean; onBehalf: boolean };

/** 브랜드 행위자: 해당 브랜드 멤버이거나 ADMIN(대행). 아니면 null — 호출부는 not_found로 응답한다. */
export async function requireBrandAccess(brandId: string): Promise<BrandAccess | null> {
  const actor = await getActor();
  if (!actor) return null;
  if (actor.role === "ADMIN") return { actor, brandId, level: "owner", canPurchase: true, onBehalf: true };
  if (!isBrandRole(actor.role)) return null;
  const { data } = await createAdminClient()
    .from("brand_members")
    .select("level, can_purchase")
    .eq("brand_id", brandId)
    .eq("profile_id", actor.id)
    .maybeSingle();
  if (!data) return null;
  return { actor, brandId, level: data.level, canPurchase: data.level === "owner" || data.can_purchase, onBehalf: false };
}
