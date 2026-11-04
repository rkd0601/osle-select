import "server-only";
import { createClient } from "@/lib/supabase/server";
import { signedReadUrls } from "@/lib/storage";
import { progressCard, sortCards, type ProgressCard, type ProgressRow } from "@/lib/brand-progress";

/**
 * 진행 화면·홈 데이터 (디자인 v2.2, DECISIONS d-9). v_*_brand 뷰만(규칙 1) + brand_id 필터(규칙 2).
 * 1순위: 0054 `v_progress_brand` 한 번. 아직 0054가 적용되지 않은 DB(클라우드 개발 DB 등)에서는 같은 모양의 행을
 * 기존 브랜드 뷰 다섯 개로 합쳐 만든다 — 계산(단계·내 차례·문장)은 둘 다 lib/brand-progress.ts 하나.
 * 사진: 제안 상품 첫 사진(v_product_images_brand), 제안이 없으면 요청 참고 사진(request_images, 브랜드 RLS).
 */
export type ProgressItem = ProgressCard & { exclusiveUntil: string | null; validUntil: string | null; name: string; photo: string | null; requestTitle: string; itemSeq: number; supplyFrom: { qty: number; productKrw: number; feeRate: number } | null; reqCreatedAt: string };

/** ProgressRow 필드 그대로(select("*") 금지 — brand-boundary 테스트) */
const PROGRESS_COLS =
  "request_item_id, request_id, brand_id, request_title, request_created_at, item_seq, item_description, item_category, item_status, item_owner_role, item_due_at, offer_id, product_id, offer_status, offer_reaction, price_tiers, fee_rate, exclusive_until, valid_until, offer_issued_at, sample_request_id, sample_status, sample_owner_role, sample_due_at, sample_qty, sample_feedback, sample_return_status, sample_feedback_due, sample_return_due, sample_payment_reported_at, order_id, order_status, order_owner_role, order_due_at, order_qty, order_deposit_reported_at, order_report_due, order_created_at";

async function rowsFromView(brandId: string): Promise<ProgressRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_progress_brand").select(PROGRESS_COLS).eq("brand_id", brandId).limit(2000);
  if (error) return null; // 뷰 없음(0054 미적용) 등 → 대체 경로
  return data as unknown as ProgressRow[];
}

async function rowsFromViews(brandId: string): Promise<ProgressRow[]> {
  const supabase = await createClient();
  const [{ data: items }, { data: reqs }, { data: offers }] = await Promise.all([
    supabase.from("v_request_items_brand").select("id, request_id, brand_id, seq, description, category, status, owner_role, due_at").eq("brand_id", brandId).limit(2000),
    supabase.from("v_requests_brand").select("id, title, created_at").eq("brand_id", brandId).limit(1000),
    supabase.from("v_offers_brand").select("id, product_id, request_item_id, status, reaction, price_tiers, fee_rate, exclusive_until, valid_until, issued_at").eq("brand_id", brandId).not("request_item_id", "is", null).limit(2000),
  ]);
  const offerIds = (offers ?? []).map((o) => o.id);
  const [{ data: sitems }, { data: lines }] = offerIds.length
    ? await Promise.all([
        supabase.from("v_sample_items_brand").select("sample_request_id, offer_id, qty, feedback, return_status, created_at").eq("brand_id", brandId).in("offer_id", offerIds),
        supabase.from("v_order_lines_brand").select("order_id, offer_id, qty, expected_qty").eq("brand_id", brandId).in("offer_id", offerIds),
      ])
    : [{ data: [] }, { data: [] }];
  const srIds = [...new Set((sitems ?? []).map((s) => s.sample_request_id))];
  const orderIds = [...new Set((lines ?? []).map((l) => l.order_id))];
  const [{ data: srs }, { data: ords }] = await Promise.all([
    srIds.length ? supabase.from("v_sample_requests_brand").select("id, status, owner_role, due_at, feedback_due, return_due, payment_reported_at, created_at").in("id", srIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from("v_orders_brand").select("id, status, owner_role, due_at, deposit_reported_at, report_due, created_at").in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const reqOf = new Map((reqs ?? []).map((r) => [r.id, r]));
  const srOf = new Map((srs ?? []).map((s) => [s.id, s]));
  const ordOf = new Map((ords ?? []).map((o) => [o.id, o]));
  const rows: ProgressRow[] = [];
  for (const ri of items ?? []) {
    const r = reqOf.get(ri.request_id);
    const head = {
      request_item_id: ri.id, request_id: ri.request_id, brand_id: ri.brand_id, request_title: r?.title ?? null, request_created_at: r?.created_at ?? "",
      item_seq: ri.seq, item_description: ri.description, item_category: ri.category, item_status: ri.status, item_owner_role: ri.owner_role, item_due_at: ri.due_at,
    };
    const empty = {
      offer_id: null, product_id: null, offer_status: null, offer_reaction: null, price_tiers: null, fee_rate: null, exclusive_until: null, valid_until: null, offer_issued_at: null,
      sample_request_id: null, sample_status: null, sample_owner_role: null, sample_due_at: null, sample_qty: null, sample_feedback: null, sample_return_status: null,
      sample_feedback_due: null, sample_return_due: null, sample_payment_reported_at: null,
      order_id: null, order_status: null, order_owner_role: null, order_due_at: null, order_qty: null, order_deposit_reported_at: null, order_report_due: null, order_created_at: null,
    };
    const its = (offers ?? []).filter((o) => o.request_item_id === ri.id);
    if (!its.length) { rows.push({ ...head, ...empty }); continue; }
    for (const o of its) {
      const off = { offer_id: o.id, product_id: o.product_id, offer_status: o.status, offer_reaction: o.reaction, price_tiers: o.price_tiers as ProgressRow["price_tiers"], fee_rate: Number(o.fee_rate), exclusive_until: o.exclusive_until, valid_until: o.valid_until, offer_issued_at: o.issued_at };
      // 샘플: 이 제안이 들어간 최근 요청서 1건(취소 제외)
      const mine = (sitems ?? []).filter((s) => s.offer_id === o.id).map((s) => ({ s, sr: srOf.get(s.sample_request_id) })).filter((x) => x.sr && x.sr.status !== "cancelled");
      mine.sort((a, b) => (b.sr!.created_at ?? "").localeCompare(a.sr!.created_at ?? ""));
      const top = mine[0];
      const same = top ? mine.filter((x) => x.sr!.id === top.sr!.id) : [];
      const smp = top ? {
        sample_request_id: top.sr!.id, sample_status: top.sr!.status, sample_owner_role: top.sr!.owner_role, sample_due_at: top.sr!.due_at,
        sample_qty: same.reduce((n, x) => n + (x.s.qty ?? 0), 0), sample_feedback: top.s.feedback, sample_return_status: top.s.return_status,
        sample_feedback_due: top.sr!.feedback_due, sample_return_due: top.sr!.return_due, sample_payment_reported_at: top.sr!.payment_reported_at,
      } : {};
      // 발주: 이 제안이 들어간 발주서마다(취소 제외)
      const byOrder = new Map<string, number>();
      for (const l of (lines ?? []).filter((l) => l.offer_id === o.id)) byOrder.set(l.order_id, (byOrder.get(l.order_id) ?? 0) + (l.qty || l.expected_qty || 0));
      const ordRows = [...byOrder].map(([id, qty]) => ({ od: ordOf.get(id), qty })).filter((x) => x.od && x.od.status !== "cancelled");
      if (!ordRows.length) { rows.push({ ...head, ...empty, ...off, ...smp }); continue; }
      for (const { od, qty } of ordRows) {
        rows.push({ ...head, ...empty, ...off, ...smp, order_id: od!.id, order_status: od!.status, order_owner_role: od!.owner_role, order_due_at: od!.due_at, order_qty: qty, order_deposit_reported_at: od!.deposit_reported_at, order_report_due: od!.report_due, order_created_at: od!.created_at });
      }
    }
  }
  return rows;
}

export async function listBrandProgress(brandId: string): Promise<ProgressItem[]> {
  const rows = (await rowsFromView(brandId)) ?? (await rowsFromViews(brandId));
  if (!rows.length) return [];
  const supabase = await createClient();
  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean) as string[])];
  const itemIds = [...new Set(rows.filter((r) => !r.product_id).map((r) => r.request_item_id))];
  const [{ data: products }, { data: pimgs }, { data: rimgs }] = await Promise.all([
    productIds.length ? supabase.from("v_products_brand").select("id, name_ko").in("id", productIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("v_product_images_brand").select("product_id, storage_path, sort_order").in("product_id", productIds).order("sort_order") : Promise.resolve({ data: [] }),
    itemIds.length ? supabase.from("request_images").select("request_item_id, storage_path, sort_order").eq("brand_id", brandId).in("request_item_id", itemIds).not("storage_path", "is", null).order("sort_order") : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((products ?? []).map((p) => [p.id, p.name_ko as string | null]));
  const pcover = new Map<string, string>();
  for (const i of pimgs ?? []) if (!pcover.has(i.product_id)) pcover.set(i.product_id, i.storage_path);
  const rcover = new Map<string, string>();
  for (const i of rimgs ?? []) if (i.storage_path && !rcover.has(i.request_item_id)) rcover.set(i.request_item_id, i.storage_path);
  const [pu, ru] = await Promise.all([signedReadUrls("productImages", [...pcover.values()]), signedReadUrls("requestImages", [...rcover.values()])]);
  const items = rows.map((r) => {
    const c = progressCard(r);
    const tiers = (r.price_tiers ?? []).slice().sort((a, b) => a.min_qty - b.min_qty);
    const pp = r.product_id ? pcover.get(r.product_id) : rcover.get(r.request_item_id);
    return {
      ...c,
      name: (r.product_id && nameOf.get(r.product_id)) || r.item_description || r.request_title || "",
      photo: pp ? (r.product_id ? pu[pp] : ru[pp]) ?? null : null,
      requestTitle: r.request_title ?? "", itemSeq: r.item_seq, reqCreatedAt: r.request_created_at, exclusiveUntil: r.exclusive_until, validUntil: r.valid_until,
      supplyFrom: tiers[0] && r.fee_rate != null ? { qty: tiers[0].min_qty, productKrw: tiers[0].product_price_krw, feeRate: Number(r.fee_rate) } : null,
    };
  });
  return sortCards(items) as ProgressItem[];
}
