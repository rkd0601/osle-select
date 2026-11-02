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
    db.from("brand_members").select("profile_id, level, can_purchase, created_at, profiles(display_name)").eq("brand_id", id),
    db.from("brand_invites").select("id, email, level, can_purchase, expires_at, accepted_at, created_at").eq("brand_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("audit_logs").select("action, diff, created_at").eq("entity", "brand").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("offers").select("id", { count: "exact", head: true }).eq("brand_id", id).in("status", ["new", "interested", "hold", "reconsent_pending"]),
    db.from("brand_change_requests").select("id, value, created_at").eq("brand_id", id).eq("status", "pending").limit(1),
  ]);
  return { brand, members: members ?? [], invites: invites ?? [], logs: logs ?? [], liveOffers: liveOffers ?? 0, slugRequest: slugReq?.[0] ?? null };
}
