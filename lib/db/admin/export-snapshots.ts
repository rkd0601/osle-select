import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { leaks, snapshotText } from "@/lib/exports/common";
import { toExportSource } from "@/lib/exports/source";

type Db = ReturnType<typeof createAdminClient>;

/**
 * 발주 확정 순간의 패키지용 상품 스냅샷 (DECISIONS 9-7). 발주 라인(qty>0)이 가리키는 제안의 상품마다 1행 — 이미 있으면 그대로 둔다.
 * 브랜드 뷰와 같은 컬럼만 고른다(원가·원청·중량·환율·마진·*_zh 제외, 품질 메모는 노출 설정일 때만, 사진은 own + 판매 가능).
 * 실패해도 확정은 되돌리지 않는다 — 호출부가 감사 로그를 남기고, 청구 내역 다시 만들기가 다시 시도한다.
 */
export async function snapshotOrderProducts(db: Db, orderId: string, brandId: string): Promise<{ ok: boolean; count: number }> {
  const { data: lines, error: e1 } = await db.from("order_lines").select("qty, offers!inner(product_id)").eq("order_id", orderId).gt("qty", 0);
  if (e1) return { ok: false, count: 0 };
  const ids = [...new Set((lines ?? []).map((l) => ((Array.isArray(l.offers) ? l.offers[0] : l.offers) as { product_id: string }).product_id))];
  if (!ids.length) return { ok: true, count: 0 };
  const [{ data: products, error: e2 }, { data: colors }, { data: sizes }, { data: variants }, { data: images }] = await Promise.all([
    db.from("products").select("id, code, name_ko, category, desc_ko, quality_note_ko, show_quality_note, fabric, origin, care_codes, supply_type, lead_days, min_qty, verified_in_person").in("id", ids),
    db.from("product_colors").select("id, product_id, name_ko, sort_order").in("product_id", ids).order("sort_order"),
    db.from("product_sizes").select("id, product_id, label, measurements, source, sort_order").in("product_id", ids).order("sort_order"),
    db.from("product_variants").select("product_id, color_id, size_id").in("product_id", ids),
    db.from("product_images").select("product_id, storage_path, sort_order").in("product_id", ids).eq("usable_for_sales", true).eq("source", "own").order("sort_order"),
  ]);
  if (e2 || !products) return { ok: false, count: 0 };
  const rows = { colors: colors ?? [], sizes: sizes ?? [], variants: variants ?? [], images: images ?? [] };
  const snaps = products.map((p) => {
    const s = toExportSource({ ...p, quality_note_ko: p.show_quality_note ? p.quality_note_ko : null }, rows);
    return { brand_id: brandId, order_id: orderId, product_id: p.id, data: { base: s.base, photoPaths: s.photoPaths } };
  });
  // 상품 정보 텍스트에 중국어·원가 단어가 섞였으면(검수 누락) 그 상품은 스냅샷하지 않는다 — 패키지 생성도 같은 검사로 막힌다
  // sizes[].source('measured'|'vendor')는 출처 라벨이라 금지어가 아니다 — snapshotText가 값을 빼고 검사 (검증 D-1: 원청 사이즈표 상품이 전부 걸러지던 문제)
  const clean = snaps.filter((s) => !leaks(snapshotText(s.data.base)));
  if (clean.length) {
    const { error } = await db.from("export_snapshots").upsert(clean, { onConflict: "order_id,product_id", ignoreDuplicates: true });
    if (error) return { ok: false, count: 0 };
  }
  return { ok: clean.length === snaps.length, count: clean.length };
}
