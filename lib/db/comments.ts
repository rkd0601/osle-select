import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CommentTarget, Visibility } from "@/lib/comments";

/**
 * 코멘트 스레드 읽기 (8단계). 역할별로 따로:
 * - 브랜드: 세션(RLS comments_brand) + brand_id 필터, visibility=brand, **body_ko만**(중국어 원문 비노출)
 * - CN: 세션(RLS comments_cn — 본인 배정 항목·본인 상품 제안), visibility=cn
 * - ADMIN: 서비스 롤, 전부
 * 작성자는 이름 대신 종류(나·위아더·브랜드 멤버 이름·중국 담당)로 — 브랜드에게 위아더 직원 이름을 보이지 않는다.
 */
export type CommentRow = { id: string; visibility: Visibility; at: string; who: "me" | "weare" | "cn" | "brand"; name: string | null; ko: string | null; zh: string | null };

async function names(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await createAdminClient().from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.display_name as string]));
}

export async function brandThread(brandId: string, userId: string, type: CommentTarget, id: string): Promise<CommentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comments").select("id, author_id, body_ko, created_at")
    .eq("brand_id", brandId).eq("visibility", "brand").eq("target_type", type).eq("target_id", id).order("created_at").limit(200);
  const authors = [...new Set((data ?? []).map((c) => c.author_id).filter(Boolean) as string[])];
  const { data: members } = authors.length
    ? await createAdminClient().from("brand_members").select("profile_id").eq("brand_id", brandId).in("profile_id", authors)
    : { data: [] };
  const memberIds = new Set((members ?? []).map((m) => m.profile_id));
  const nm = await names([...memberIds]);
  return (data ?? []).map((c) => ({
    id: c.id, visibility: "brand", at: c.created_at, ko: c.body_ko, zh: null,
    who: c.author_id === userId ? "me" : c.author_id && memberIds.has(c.author_id) ? "brand" : "weare",
    name: c.author_id && memberIds.has(c.author_id) ? (nm.get(c.author_id) ?? null) : null,
  }));
}

export async function cnThread(userId: string, type: CommentTarget, id: string): Promise<CommentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comments").select("id, author_id, body_ko, body_zh, created_at")
    .eq("visibility", "cn").eq("target_type", type).eq("target_id", id).order("created_at").limit(200);
  return (data ?? []).map((c) => ({ id: c.id, visibility: "cn", at: c.created_at, ko: c.body_ko, zh: c.body_zh, who: c.author_id === userId ? "me" : "weare", name: null }));
}

export async function adminThread(type: CommentTarget, id: string, userId: string): Promise<CommentRow[]> {
  const { data } = await createAdminClient()
    .from("comments").select("id, author_id, visibility, body_ko, body_zh, created_at, brand_id")
    .eq("target_type", type).eq("target_id", id).order("created_at").limit(300);
  const nm = await names([...new Set((data ?? []).map((c) => c.author_id).filter(Boolean) as string[])]);
  return (data ?? []).map((c) => ({
    id: c.id, visibility: c.visibility as Visibility, at: c.created_at, ko: c.body_ko, zh: c.body_zh,
    who: c.author_id === userId ? "me" : "weare", // 관리자 화면은 이름을 함께 보여 준다
    name: c.author_id ? (nm.get(c.author_id) ?? null) : null,
  }));
}
