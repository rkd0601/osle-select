import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES, type Role } from "@/lib/config";

export type SessionUser = { id: string; email: string | null; role: Role; displayName: string | null; locale: "ko" | "zh-CN" };

export function parseRole(v: unknown): Role | null {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v) ? (v as Role) : null;
}

/** 로그인 사용자 + 역할. 없으면 null. getUser()는 Auth 서버에서 검증하므로 위조 불가. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  const role = parseRole(u.app_metadata?.role);
  if (!role) return null;
  const { data: p } = await supabase.from("profiles").select("display_name, locale").eq("id", u.id).maybeSingle();
  return {
    id: u.id,
    email: u.email ?? null,
    role,
    displayName: p?.display_name ?? null,
    locale: (p?.locale as "ko" | "zh-CN") ?? (role.startsWith("CN") ? "zh-CN" : "ko"),
  };
}

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return u;
}

export async function requireRole(allowed: Role[], nextPath?: string): Promise<SessionUser> {
  const u = await requireUser(nextPath);
  if (!allowed.includes(u.role)) notFound(); // 권한 없음도 404로 (존재 자체를 숨긴다)
  return u;
}

/** 브랜드 멤버십 검증: slug의 브랜드에 소속되어 있지 않으면 404 (미존재·무권한 동일). */
export async function requireBrandMember(slug: string) {
  const u = await requireUser(`/b/${slug}`);
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("id, slug, name, tier").eq("slug", slug).maybeSingle();
  if (!brand) notFound(); // RLS: 소속 아니면 행이 없다
  if (u.role === "ADMIN") return { user: u, brand, member: { level: "owner" as const, can_purchase: true, onBehalf: true } };
  const { data: m } = await supabase.from("brand_members").select("level, can_purchase").eq("brand_id", brand.id).eq("profile_id", u.id).maybeSingle();
  if (!m) notFound();
  return { user: u, brand, member: { ...m, onBehalf: false } };
}
