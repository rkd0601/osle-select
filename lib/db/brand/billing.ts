import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * 청구 화면 (디자인 v2.2 "청구") · 상세 화면 썸네일용 읽기 전용 쿼리. v_*_brand 뷰만 + brand_id 필터(절대 규칙 1·2).
 * 금액은 발주에 고정된 청구 내역(invoice_snapshot.total_krw)과 선금(deposit_krw)뿐 — 원가·원청·마진·환율 없음. 결제 자동화 없음(규칙 13).
 */
const DONE = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"];

/** 상품별 대표 사진 경로(실물컷 먼저, 그다음 정렬 순) */
export async function coverPathsByProduct(productIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(productIds)];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("v_product_images_brand").select("product_id, storage_path, kind, sort_order").in("product_id", ids).order("sort_order");
  for (const pid of ids) {
    const imgs = (data ?? []).filter((i) => i.product_id === pid);
    const pick = imgs.find((i) => i.kind === "real") ?? imgs[0];
    if (pick?.storage_path) out.set(pid, pick.storage_path);
  }
  return out;
}

export type BillingOrder = {
  id: string; status: string; ownerRole: string | null; createdAt: string; depositReportedAt: string | null;
  depositKrw: number | null; depositConfirmedAt: string | null;
  firstName: string | null; more: number; qty: number; total: number | null; cover: string | null; reorder: boolean;
};

/** 청구 표: 발주마다 첫 상품(이름·사진) · 수량 · 고정된 청구 합계 · 리오더 여부 */
export async function listBillingOrders(brandId: string): Promise<BillingOrder[]> {
  const supabase = await createClient();
  const [{ data: orders }, { data: lines }] = await Promise.all([
    supabase.from("v_orders_brand")
      .select("id, status, owner_role, created_at, deposit_krw, deposit_reported_at, deposit_confirmed_at, invoice_snapshot")
      .eq("brand_id", brandId).order("created_at", { ascending: false }).limit(100),
    supabase.from("v_order_lines_brand").select("order_id, offer_id, expected_qty, qty, confirmed_qty").eq("brand_id", brandId),
  ]);
  const offerIds = [...new Set((lines ?? []).map((l) => l.offer_id))];
  const { data: offers } = offerIds.length ? await supabase.from("v_offers_brand").select("id, product_id").eq("brand_id", brandId).in("id", offerIds) : { data: [] };
  const productOf = new Map((offers ?? []).map((o) => [o.id, o.product_id as string]));
  const pids = [...new Set((offers ?? []).map((o) => o.product_id as string))];
  const [{ data: products }, covers] = await Promise.all([
    pids.length ? supabase.from("v_products_brand").select("id, name_ko").in("id", pids) : Promise.resolve({ data: [] as { id: string; name_ko: string | null }[] }),
    coverPathsByProduct(pids),
  ]);
  const nameOf = new Map((products ?? []).map((p) => [p.id, p.name_ko as string | null]));
  const list = orders ?? [];
  // 리오더: 이 발주보다 먼저 확정된 발주에 같은 상품이 있었다
  const productsOfOrder = new Map<string, string[]>();
  for (const o of list) {
    const ps: string[] = [];
    for (const l of (lines ?? []).filter((x) => x.order_id === o.id)) {
      const p = productOf.get(l.offer_id);
      if (p && !ps.includes(p)) ps.push(p);
    }
    productsOfOrder.set(o.id, ps);
  }
  return list.map((o) => {
    const ls = (lines ?? []).filter((l) => l.order_id === o.id);
    const ps = productsOfOrder.get(o.id) ?? [];
    const first = ps[0] ?? null;
    const reorder = list.some((x) => x.id !== o.id && DONE.includes(x.status) && x.created_at < o.created_at && (productsOfOrder.get(x.id) ?? []).some((p) => ps.includes(p)));
    return {
      id: o.id, status: o.status, ownerRole: o.owner_role, createdAt: o.created_at, depositReportedAt: o.deposit_reported_at,
      depositKrw: o.deposit_krw, depositConfirmedAt: o.deposit_confirmed_at,
      firstName: first ? nameOf.get(first) ?? null : null, more: Math.max(0, ps.length - 1),
      qty: ls.reduce((s, l) => s + (l.qty || l.confirmed_qty || l.expected_qty), 0),
      total: ((o.invoice_snapshot ?? null) as { total_krw?: number } | null)?.total_krw ?? null,
      cover: first ? covers.get(first) ?? null : null,
      reorder,
    };
  });
}

/** 발주 상세 메타 "리오더": 이 발주보다 먼저 확정된 발주에 같은 상품이 있었는지 */
export async function isReorder(brandId: string, orderId: string, createdAt: string, productIds: string[]): Promise<boolean> {
  if (!productIds.length) return false;
  const supabase = await createClient();
  const { data: done } = await supabase.from("v_orders_brand").select("id").eq("brand_id", brandId).in("status", DONE).lt("created_at", createdAt).neq("id", orderId);
  if (!done?.length) return false;
  const { data: lines } = await supabase.from("v_order_lines_brand").select("offer_id").eq("brand_id", brandId).in("order_id", done.map((d) => d.id));
  const offerIds = [...new Set((lines ?? []).map((l) => l.offer_id))];
  if (!offerIds.length) return false;
  const { data: offers } = await supabase.from("v_offers_brand").select("product_id").eq("brand_id", brandId).in("id", offerIds);
  return (offers ?? []).some((o) => productIds.includes(o.product_id as string));
}
