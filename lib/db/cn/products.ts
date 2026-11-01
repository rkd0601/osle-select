import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/auth/guards";
import { productPublishChecks } from "@/lib/products";

/**
 * CN 상품 쿼리 (C-02·C-03·C-04). 원가(product_costs)·원청(vendors)은 authenticated 권한이 없으므로 서비스 롤로 읽고,
 * 소유 필터(created_by = actor)를 코드로 건다. ADMIN은 전체. 호출부는 requireCn()으로 actor를 먼저 얻는다.
 */
const own = (actor: Actor) => (actor.role === "ADMIN" ? null : actor.id);

export async function listMyProducts(actor: Actor, status?: string) {
  const db = createAdminClient();
  let q = db
    .from("products")
    .select("id, code, status, category, name_zh, name_ko, owner_role, due_at, rejected_reasons, recheck_reason, source_request_item_id, updated_at, product_images(storage_path, sort_order)")
    .order("updated_at", { ascending: false })
    .limit(200);
  const mine = own(actor);
  if (mine) q = q.eq("created_by", mine);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((p) => {
    const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    return { ...p, cover: imgs[0]?.storage_path ?? null, photoCount: imgs.length };
  });
}

export async function getMyProduct(actor: Actor, id: string) {
  const db = createAdminClient();
  let q = db.from("products").select("*").eq("id", id);
  const mine = own(actor);
  if (mine) q = q.eq("created_by", mine);
  const { data: product } = await q.maybeSingle();
  if (!product) return null;
  const [{ data: cost }, { data: images }, { data: colors }, { data: sizes }, { data: variants }, { data: vendor }] = await Promise.all([
    db.from("product_costs").select("tiers, vendor_code, source_market, notes").eq("product_id", id).maybeSingle(),
    db.from("product_images").select("id, storage_path, kind, source, usable_for_sales, sort_order, color_id").eq("product_id", id).order("sort_order"),
    db.from("product_colors").select("id, name_zh, name_ko, hex, sort_order").eq("product_id", id).order("sort_order"),
    db.from("product_sizes").select("id, label, measurements, source, sort_order").eq("product_id", id).order("sort_order"),
    db.from("product_variants").select("id, color_id, size_id, sku").eq("product_id", id),
    product.vendor_id
      ? db.from("vendors").select("id, name, market, booth, wechat, card_image_path, default_hold, default_sample_ok, default_label_options, default_mod_options, trust_score").eq("id", product.vendor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const tiers = (cost?.tiers ?? []) as { min_qty: number; cost_cny: number }[];
  const checks = productPublishChecks({
    product,
    vendor: vendor ?? null,
    images: images ?? [],
    colorCount: colors?.length ?? 0,
    sizeCount: sizes?.length ?? 0,
    costTierCount: tiers.length,
  });
  return { product, cost: { ...cost, tiers }, images: images ?? [], colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], vendor: vendor ?? null, checks };
}

/** "최근 원청" 1탭 (기획서 F2): 내가 최근 상품에 쓴 원청 → 내가 만든 원청 순. ADMIN은 최근 수정 순. */
export async function listRecentVendors(actor: Actor, limit = 8) {
  const db = createAdminClient();
  const mine = own(actor);
  const cols = "id, name, market, booth, default_sample_ok";
  if (!mine) {
    const { data } = await db.from("vendors").select(cols).order("updated_at", { ascending: false }).limit(limit);
    return data ?? [];
  }
  const [{ data: used }, { data: created }] = await Promise.all([
    db.from("products").select("vendor_id, updated_at").eq("created_by", mine).not("vendor_id", "is", null).order("updated_at", { ascending: false }).limit(40),
    db.from("vendors").select(cols).eq("created_by", mine).order("updated_at", { ascending: false }).limit(limit),
  ]);
  const order = [...new Set((used ?? []).map((u) => u.vendor_id as string))];
  const { data: usedVendors } = order.length ? await db.from("vendors").select(cols).in("id", order) : { data: [] };
  const byId = new Map([...(created ?? []), ...(usedVendors ?? [])].map((v) => [v.id, v]));
  return [...order, ...(created ?? []).map((v) => v.id)].filter((id, i, a) => a.indexOf(id) === i).map((id) => byId.get(id)!).filter(Boolean).slice(0, limit);
}

/** C-02 진입 시 요청 항목 요약 (배정된 항목만 — v_request_items_cn과 같은 조건을 코드로) */
export async function getAssignedItemBrief(actor: Actor, itemId: string) {
  const db = createAdminClient();
  let q = db.from("request_items").select("id, seq, description_zh, status, assigned_to").eq("id", itemId);
  if (actor.role !== "ADMIN") q = q.eq("assigned_to", actor.id);
  const { data } = await q.maybeSingle();
  return data && (data.status === "assigned" || data.status === "sourcing") ? data : null;
}
