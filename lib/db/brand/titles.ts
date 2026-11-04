import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * 발주·샘플 제목 `{첫 상품명} 외 n · {수량}장` (디자인 v2 §5, DECISIONS d-4)에 쓰는 상품명.
 * v_offers_brand → v_products_brand 뷰만 + brand_id 필터(절대 규칙 1·2). 이름(name_ko)·id 외에는 읽지 않는다.
 */
export async function productNamesByOffer(brandId: string, offerIds: string[]) {
  const ids = [...new Set(offerIds)];
  const out = new Map<string, { productId: string; name: string | null }>();
  if (!ids.length) return out;
  const supabase = await createClient();
  const { data: offers } = await supabase.from("v_offers_brand").select("id, product_id").eq("brand_id", brandId).in("id", ids);
  const pids = [...new Set((offers ?? []).map((o) => o.product_id))];
  const { data: products } = pids.length ? await supabase.from("v_products_brand").select("id, name_ko").in("id", pids) : { data: [] };
  const nameOf = new Map((products ?? []).map((p) => [p.id, p.name_ko as string | null]));
  for (const o of offers ?? []) out.set(o.id, { productId: o.product_id, name: nameOf.get(o.product_id) ?? null });
  return out;
}

/** 라인(offer_id 순서)에서 첫 상품명과 나머지 상품 수 — 같은 상품의 여러 variant는 1개로 센다 */
export function bundleOf(offerIds: string[], names: Map<string, { productId: string; name: string | null }>) {
  const seen: { productId: string; name: string | null }[] = [];
  for (const id of offerIds) {
    const p = names.get(id);
    if (p && !seen.some((s) => s.productId === p.productId)) seen.push(p);
  }
  return { firstName: seen[0]?.name ?? null, more: Math.max(0, seen.length - 1) };
}
