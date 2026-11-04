import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** A-07 브랜드 관리 (서비스 롤 — 레이아웃이 ADMIN 검증). 수수료·숨은 마진은 여기서만 읽는다(브랜드 비노출). */
export async function listBrandsForAdmin() {
  const db = createAdminClient();
  const [{ data: brands }, { data: apps }, { data: members }] = await Promise.all([
    db.from("brands").select("id, slug, name, type, tier, fee_rate, hidden_margin_rate, credit_balance_krw, status, approved_at, created_at").order("created_at", { ascending: false }).limit(300),
    db.from("brand_applications").select("id, brand_name, type, channels, follower_scale, contact_name, contact_email, contact_phone, biz_reg_no, is_ecommerce_registered, cn_content_optin, note, status, created_at").eq("status", "pending").order("created_at"),
    db.from("brand_members").select("brand_id"),
  ]);
  const count = new Map<string, number>();
  for (const m of members ?? []) count.set(m.brand_id, (count.get(m.brand_id) ?? 0) + 1);
  return { brands: (brands ?? []).map((b) => ({ ...b, members: count.get(b.id) ?? 0 })), applications: apps ?? [] };
}

export async function getBrandForAdmin(id: string) {
  const db = createAdminClient();
  const { data: brand } = await db.from("brands").select("id, slug, name, type, tier, channels, fee_rate, hidden_margin_rate, credit_balance_krw, status, approved_at, created_at").eq("id", id).maybeSingle();
  if (!brand) return null;
  // 조건 변경 안내용: 아직 살아 있는 발행 제안 수(발행 시 요율 고정 — r7-11)
  const [{ data: members }, { data: invites }, { data: logs }, { count: liveOffers }, { data: slugReq }] = await Promise.all([
    // profiles 임베딩은 FK가 둘(profile_id·invited_by)이라 PostgREST가 모호성 오류를 내므로 이름은 아래에서 따로 붙인다 (2026-11-04 UX 검증)
    db.from("brand_members").select("profile_id, level, can_purchase, joined_at").eq("brand_id", id).order("joined_at"),
    db.from("brand_invites").select("id, email, level, can_purchase, expires_at, accepted_at, created_at").eq("brand_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("audit_logs").select("action, diff, created_at").eq("entity", "brand").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("offers").select("id", { count: "exact", head: true }).eq("brand_id", id).in("status", ["new", "interested", "hold", "reconsent_pending"]),
    db.from("brand_change_requests").select("id, value, created_at").eq("brand_id", id).eq("status", "pending").limit(1),
  ]);
  const ids = (members ?? []).map((m) => m.profile_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] as { id: string; display_name: string }[] };
  const named = (members ?? []).map((m) => ({ ...m, display_name: profiles?.find((p) => p.id === m.profile_id)?.display_name || null }));
  return { brand, members: named, invites: invites ?? [], logs: logs ?? [], liveOffers: liveOffers ?? 0, slugRequest: slugReq?.[0] ?? null };
}

/**
 * 옛 slug 90일 재사용 금지 (DECISIONS r8-5). 다른 브랜드가 최근 90일 안에 승인으로 내려놓은 주소면 true.
 * DB 트리거(0049)가 최종 방어 — 여기서는 화면에 이유를 보여 주려고 먼저 본다.
 */
export async function slugCoolingDown(slug: string, brandId: string | null): Promise<boolean> {
  let q = createAdminClient().from("brand_change_requests").select("id").eq("kind", "slug").eq("status", "approved").eq("previous_value", slug)
    .gt("decided_at", new Date(Date.now() - 90 * 86_400_000).toISOString()).limit(1);
  if (brandId) q = q.neq("brand_id", brandId);
  const { data } = await q;
  return !!data?.length;
}
/** 0049 트리거 오류(slug_cooling_down) 판별 */
export const isSlugCoolingError = (e: { code?: string; message?: string } | null) => !!e && e.code === "P0001" && /slug_cooling_down/.test(e.message ?? "");
