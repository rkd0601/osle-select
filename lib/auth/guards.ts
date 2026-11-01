import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBrandRole, isCnRole, type Role } from "@/lib/config";
import { getSessionUser } from "./session";

/**
 * Server Action용 권한 확인. 페이지 가드(session.ts)와 달리 redirect/notFound 대신 null을 돌려준다.
 * 역할은 JWT app_metadata.role(getUser는 Auth 서버 검증). 브랜드 멤버십은 서비스 롤로 직접 확인한다
 * (액션은 서비스 롤로 쓰므로 RLS에 기대지 않고 코드에서 brand_id를 다시 검사한다 — 이중 방어).
 */
export type Actor = { id: string; role: Role };

/** 페이지 가드와 같은 판정(역할 없음·비활성 계정 = 없음). getSessionUser는 요청 단위 캐시. */
export async function getActor(): Promise<Actor | null> {
  const u = await getSessionUser();
  return u ? { id: u.id, role: u.role } : null;
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
  if (actor.role !== "ADMIN" && !isBrandRole(actor.role)) return null;
  const db = createAdminClient();
  // 페이지 가드(requireBrandMember)와 같이: 정지된 브랜드는 ADMIN만
  const { data: brand } = await db.from("brands").select("status").eq("id", brandId).maybeSingle();
  if (!brand) return null;
  if (actor.role === "ADMIN") return { actor, brandId, level: "owner", canPurchase: true, onBehalf: true };
  if (brand.status !== "active") return null;
  const { data } = await db
    .from("brand_members")
    .select("level, can_purchase")
    .eq("brand_id", brandId)
    .eq("profile_id", actor.id)
    .maybeSingle();
  if (!data) return null;
  return { actor, brandId, level: data.level, canPurchase: data.level === "owner" || data.can_purchase, onBehalf: false };
}
