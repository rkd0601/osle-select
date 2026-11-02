import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExportProduct } from "@/lib/exports";

/**
 * B-12 쇼핑몰 패키지 쿼리 (브랜드 세션, v_*_brand 뷰만 — 절대 규칙 1). 대상 상품 = 발주 확정 상품 + 샘플 채택(관심) 상품 (PRD 10장).
 * 판매 가능 사진(usable_for_sales)만 — 참고 이미지·원청 사진은 뷰 단계에서 이 플래그가 꺼져 있다.
 */
const DONE = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"];

export async function listExportCandidates(brandId: string) {
  const supabase = await createClient();
  const [{ data: done }, { data: liked }] = await Promise.all([
    supabase.from("v_orders_brand").select("id").eq("brand_id", brandId).in("status", DONE),
    supabase.from("v_sample_items_brand").select("offer_id").eq("brand_id", brandId).eq("feedback", "interested"),
  ]);
  const { data: lines } = done?.length ? await supabase.from("v_order_lines_brand").select("offer_id").eq("brand_id", brandId).gt("qty", 0).in("order_id", done.map((d) => d.id)) : { data: [] };
  const orderOffers = new Set((lines ?? []).map((l) => l.offer_id));
  const sampleOffers = new Set((liked ?? []).map((s) => s.offer_id));
  const offerIds = [...new Set([...orderOffers, ...sampleOffers])];
  if (!offerIds.length) return [];
  const { data: offers } = await supabase.from("v_offers_brand").select("id, product_id").eq("brand_id", brandId).in("id", offerIds);
  const src = new Map<string, { order: boolean; sample: boolean }>();
  for (const o of offers ?? []) {
    const cur = src.get(o.product_id) ?? { order: false, sample: false };
    src.set(o.product_id, { order: cur.order || orderOffers.has(o.id), sample: cur.sample || sampleOffers.has(o.id) });
  }
  const ids = [...src.keys()];
  const [{ data: products }, { data: images }] = await Promise.all([
    supabase.from("v_products_brand").select("id, code, name_ko, category").in("id", ids),
    supabase.from("v_product_images_brand").select("product_id, storage_path, sort_order").in("product_id", ids).eq("usable_for_sales", true).order("sort_order"),
  ]);
  return (products ?? []).map((p) => ({
    productId: p.id as string, code: p.code as string, name: (p.name_ko ?? "") as string, category: p.category as string | null,
    ...src.get(p.id)!,
    photoCount: (images ?? []).filter((i) => i.product_id === p.id).length,
    cover: (images ?? []).find((i) => i.product_id === p.id)?.storage_path ?? null,
  }));
}

/** 패키지 입력: 대상 상품만(호출부가 후보 집합으로 검증), 판매 가능 사진 경로 포함 */
export async function loadExportProducts(productIds: string[]): Promise<{ products: ExportProduct[]; photos: { code: string; path: string; name: string }[] }> {
  const supabase = await createClient();
  const [{ data: products }, { data: colors }, { data: sizes }, { data: variants }, { data: images }] = await Promise.all([
    supabase.from("v_products_brand").select("id, code, name_ko, category, desc_ko, quality_note_ko, fabric, origin, care_codes").in("id", productIds),
    supabase.from("v_product_colors_brand").select("id, product_id, name_ko, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_sizes_brand").select("id, product_id, label, measurements, sort_order").in("product_id", productIds).order("sort_order"),
    supabase.from("v_product_variants_brand").select("product_id, color_id, size_id").in("product_id", productIds),
    supabase.from("v_product_images_brand").select("product_id, storage_path, sort_order").in("product_id", productIds).eq("usable_for_sales", true).order("sort_order"),
  ]);
  const photos: { code: string; path: string; name: string }[] = [];
  const out: ExportProduct[] = (products ?? []).map((p) => {
    const cs = (colors ?? []).filter((c) => c.product_id === p.id);
    const ss = (sizes ?? []).filter((s) => s.product_id === p.id);
    const imgs = (images ?? []).filter((i) => i.product_id === p.id && i.storage_path);
    const names = imgs.map((i, k) => {
      const ext = (i.storage_path!.split(".").pop() ?? "webp").toLowerCase();
      const name = `images/${p.code}_${String(k + 1).padStart(2, "0")}.${ext}`;
      photos.push({ code: p.code, path: i.storage_path!, name });
      return name;
    });
    return {
      code: p.code, name: p.name_ko ?? "", category: p.category, desc: p.desc_ko, qualityNote: p.quality_note_ko,
      fabric: (p.fabric ?? []) as ExportProduct["fabric"], origin: p.origin, careCodes: (p.care_codes ?? []) as string[],
      colors: cs.map((c) => c.name_ko ?? ""),
      sizes: ss.map((s) => ({ label: s.label, measurements: (s.measurements ?? {}) as Record<string, number> })),
      variants: (variants ?? []).filter((v) => v.product_id === p.id).flatMap((v) => {
        const c = cs.find((x) => x.id === v.color_id)?.name_ko ?? "";
        const s = ss.find((x) => x.id === v.size_id)?.label ?? "";
        return c || s ? [{ color: c, size: s }] : [];
      }),
      images: names,
    };
  });
  return { products: out, photos };
}

export async function listExportPackages(brandId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("export_packages").select("id, product_ids, shop_type, files, status, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(20);
  return data ?? [];
}
