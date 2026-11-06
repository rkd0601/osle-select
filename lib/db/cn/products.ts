import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/auth/guards";
import { productPublishChecks } from "@/lib/products";

/**
 * CN 상품 쿼리 (C-02·C-03·C-04). 원가(product_costs)·원청(vendors)은 authenticated 권한이 없으므로 서비스 롤로 읽고,
 * 소유 필터(created_by = actor)를 코드로 건다. ADMIN은 전체. 호출부는 requireCn()으로 actor를 먼저 얻는다.
 */
const own = (actor: Actor) => (actor.role === "ADMIN" ? null : actor.id);

/** CN_VENDOR가 묶인 원청 id (vendors.owner_profile_id). 그 원청 상품은 소싱 담당이 등록했어도 읽기 전용으로 본다 (DECISIONS u-12) */
async function myVendorId(actor: Actor): Promise<string | null> {
  if (actor.role !== "CN_VENDOR") return null;
  const { data } = await createAdminClient().from("vendors").select("id").eq("owner_profile_id", actor.id).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function listMyProducts(actor: Actor, status?: string) {
  const db = createAdminClient();
  let q = db
    .from("products")
    .select("id, code, status, category, name_zh, name_ko, owner_role, due_at, rejected_reasons, recheck_reason, source_request_item_id, updated_at, created_by, product_images(storage_path, sort_order)")
    .order("updated_at", { ascending: false })
    .limit(200);
  const mine = own(actor);
  const vendorId = await myVendorId(actor);
  if (mine && vendorId) q = q.or(`created_by.eq.${mine},vendor_id.eq.${vendorId}`); // uuid 두 개(서버 값)만 — 사용자 입력 아님
  else if (mine) q = q.eq("created_by", mine);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((p) => {
    const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const { created_by, ...rest } = p;
    return { ...rest, cover: imgs[0]?.storage_path ?? null, photoCount: imgs.length, readOnly: !!mine && created_by !== mine };
  });
}

/**
 * 상품 1건 + 원가·사진·컬러·사이즈·원청·공개 조건. 기본은 **본인 등록분만**(편집 서버 액션들이 이 함수로 소유를 확인한다).
 * `allowVendorRead`는 C-03 화면 전용: CN_VENDOR가 자기 원청 상품을 읽기 전용으로 연다(readOnly=true) (u-12).
 */
export async function getMyProduct(actor: Actor, id: string, opts: { allowVendorRead?: boolean } = {}) {
  const db = createAdminClient();
  const q = db.from("products").select("*").eq("id", id);
  const mine = own(actor);
  const vendorId = opts.allowVendorRead ? await myVendorId(actor) : null;
  const { data: found } = await q.maybeSingle();
  // 본인 등록분, 또는 CN_VENDOR의 자기 원청 상품(읽기 전용). 그 밖은 존재를 숨긴다
  const readOnly = !!mine && found?.created_by !== mine;
  if (!found || (readOnly && !(vendorId && found.vendor_id === vendorId))) return null;
  // 읽기 전용(원청)에는 소싱 담당의 품질 메모를 내지 않는다 (u-12)
  const product = readOnly ? { ...found, quality_note_zh: null } : found;
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
  const costOut = readOnly ? { ...cost, notes: null, tiers } : { ...cost, tiers };
  return { readOnly, product, cost: costOut, images: images ?? [], colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], vendor: vendor ?? null, checks };
}

/**
 * "최근 원청" 1탭 (기획서 F2): 내가 최근 상품에 쓴 원청 → 내가 만든 원청 → (CN_SOURCER) 동료·관리자가 등록한 원청 순.
 * CN_VENDOR(원청 본인, 2차)는 owner_profile_id 원청 1곳만. ADMIN은 최근 수정 순. 원청 중복 등록을 줄이려고 SOURCER는 전체를 본다.
 */
export async function listRecentVendors(actor: Actor, limit = 8) {
  const db = createAdminClient();
  const mine = own(actor);
  const cols = "id, name, market, booth, default_sample_ok";
  // CN_VENDOR(원청 본인)는 owner_profile_id로 지정된 원청 1곳만 (COWORK_DECISIONS Q5)
  if (actor.role === "CN_VENDOR") {
    const { data } = await db.from("vendors").select(cols).eq("owner_profile_id", actor.id).limit(1);
    return data ?? [];
  }
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
  const { data: others } = actor.role === "CN_SOURCER" ? await db.from("vendors").select(cols).order("updated_at", { ascending: false }).limit(limit * 3) : { data: [] };
  const usable = usedVendors ?? [];
  const byId = new Map([...(created ?? []), ...usable, ...(others ?? [])].map((v) => [v.id, v]));
  return [...order, ...(created ?? []).map((v) => v.id), ...(others ?? []).map((v) => v.id)]
    .filter((id, i, a) => a.indexOf(id) === i && byId.has(id))
    .map((id) => byId.get(id)!)
    .slice(0, limit);
}

/** C-02 진입 시 요청 항목 요약 (배정된 항목만 — v_request_items_cn과 같은 조건을 코드로) */
export async function getAssignedItemBrief(actor: Actor, itemId: string) {
  const db = createAdminClient();
  let q = db.from("request_items").select("id, seq, description_zh, status, assigned_to").eq("id", itemId);
  if (actor.role !== "ADMIN") q = q.eq("assigned_to", actor.id);
  const { data } = await q.maybeSingle();
  return data && (data.status === "assigned" || data.status === "sourcing") ? data : null;
}

/** C-03 상품 상세 제목·머리용 요청 항목 요약 (§0-l P3) — 상태와 무관, 배정받은 사람·ADMIN만 */
export async function getItemBriefForProduct(actor: Actor, itemId: string | null) {
  if (!itemId) return null;
  const db = createAdminClient();
  let q = db.from("request_items").select("id, seq, description_zh").eq("id", itemId);
  if (actor.role !== "ADMIN") q = q.eq("assigned_to", actor.id);
  const { data } = await q.maybeSingle();
  return data;
}
