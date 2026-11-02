import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fromSnapshot, toExportSource, type ExportSource } from "@/lib/exports/source";

/**
 * B-12 패키지 쿼리 (브랜드 세션, v_*_brand 뷰 + export_snapshots만 — 절대 규칙 1). 대상 = 발주 확정 상품 + 샘플 채택(관심) 상품 (PRD 10장).
 * 발주 확정 상품은 확정 순간의 스냅샷(DECISIONS 9-7)으로 — 상품이 뒤에 브랜드 뷰에서 사라져도 패키지를 만들 수 있다.
 * 스냅샷이 없는 확정 건(0043 이전)과 샘플 채택 상품은 뷰에서. 사진은 위아더 실물컷(source='own') + 판매 가능만 (r7-13).
 */
const DONE = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"];
const PRODUCT_COLS = "id, code, name_ko, category, desc_ko, quality_note_ko, fabric, origin, care_codes, supply_type, lead_days, min_qty, verified_in_person";

/** 이 브랜드의 상품별 최신 스냅샷 */
async function snapshots(brandId: string, productIds?: string[]) {
  const supabase = await createClient();
  let q = supabase.from("export_snapshots").select("product_id, data, created_at").eq("brand_id", brandId).order("created_at", { ascending: false });
  if (productIds) q = q.in("product_id", productIds);
  const { data } = await q;
  const out = new Map<string, ExportSource>();
  for (const r of data ?? []) {
    if (out.has(r.product_id)) continue;
    const s = fromSnapshot(r.product_id, r.data);
    if (s) out.set(r.product_id, s);
  }
  return out;
}

/** 뷰에서 읽은 원본 (브랜드 세션 RLS + 뷰 조건) */
async function fromViews(productIds: string[]): Promise<ExportSource[]> {
  if (!productIds.length) return [];
  const supabase = await createClient();
  const [{ data: products }, { data: colors }, { data: sizes }, { data: variants }, { data: images }] = await Promise.all([
    supabase.from("v_products_brand").select(PRODUCT_COLS).in("id", productIds),
    supabase.from("v_product_colors_brand").select("id, product_id, name_ko, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_sizes_brand").select("id, product_id, label, measurements, source, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_variants_brand").select("product_id, color_id, size_id").in("product_id", productIds),
    supabase.from("v_product_images_brand").select("product_id, storage_path, sort_order").in("product_id", productIds).eq("usable_for_sales", true).eq("source", "own").order("sort_order"),
  ]);
  const rows = { colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], images: images ?? [] };
  return (products ?? []).map((p) => toExportSource(p, rows));
}

export async function listExportCandidates(brandId: string) {
  const supabase = await createClient();
  const [{ data: done }, { data: liked }, snaps] = await Promise.all([
    supabase.from("v_orders_brand").select("id").eq("brand_id", brandId).in("status", DONE),
    supabase.from("v_sample_items_brand").select("offer_id").eq("brand_id", brandId).eq("feedback", "interested"),
    snapshots(brandId),
  ]);
  const { data: lines } = done?.length ? await supabase.from("v_order_lines_brand").select("offer_id").eq("brand_id", brandId).gt("qty", 0).in("order_id", done.map((d) => d.id)) : { data: [] };
  const orderOffers = new Set((lines ?? []).map((l) => l.offer_id));
  const sampleOffers = new Set((liked ?? []).map((s) => s.offer_id));
  const offerIds = [...new Set([...orderOffers, ...sampleOffers])];
  const { data: offers } = offerIds.length ? await supabase.from("v_offers_brand").select("id, product_id").eq("brand_id", brandId).in("id", offerIds) : { data: [] };
  const src = new Map<string, { order: boolean; sample: boolean }>();
  for (const id of snaps.keys()) src.set(id, { order: true, sample: false });
  for (const o of offers ?? []) {
    const cur = src.get(o.product_id) ?? { order: false, sample: false };
    src.set(o.product_id, { order: cur.order || orderOffers.has(o.id), sample: cur.sample || sampleOffers.has(o.id) });
  }
  const live = await fromViews([...src.keys()].filter((id) => !snaps.has(id)));
  return [...snaps.values(), ...live]
    .filter((s) => src.has(s.productId))
    .map((s) => ({
      productId: s.productId, code: s.base.code, name: s.base.name, category: s.base.category,
      ...src.get(s.productId)!,
      photoCount: s.photoPaths.length,
      cover: s.photoPaths[0] ?? null,
    }));
}

/** 패키지 입력: 대상 상품만(호출부가 후보 집합으로 검증). 스냅샷 우선, 없으면 뷰 */
export async function loadExportSources(brandId: string, productIds: string[]): Promise<ExportSource[]> {
  const snaps = await snapshots(brandId, productIds);
  const live = await fromViews(productIds.filter((id) => !snaps.has(id)));
  const all = new Map([...live.map((s) => [s.productId, s] as const), ...snaps]);
  return productIds.flatMap((id) => (all.has(id) ? [all.get(id)!] : []));
}

export async function listExportPackages(brandId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("export_packages").select("id, product_ids, shop_type, files, status, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(20);
  return data ?? [];
}
