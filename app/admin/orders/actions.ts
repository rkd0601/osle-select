"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { applyFieldTransition, applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { finalInvoiceParts, latestFinalApproval, loadOrderForCalc, notifyOrderCnOwners } from "@/lib/db/admin/orders";
import { snapshotOrderProducts } from "@/lib/db/admin/export-snapshots";
import { notify } from "@/lib/notify";
import { logisticsEstimateKrw } from "@/lib/pricing";
import { creditAmount, finalApprovalState, infoMatchRate, orderDeposit, orderInvoice, orderOptionLines, stockAggregate } from "@/lib/orders";

/**
 * A-06 발주 관리 — 체인: 재고 확인 요청 → (선금 안내 → 입금 확인) → 범위 견적 → 최종 견적 → **발주 확정**(청구 내역 고정) → 출고 후 처리 → 검품 → 발송 → 검수 보고·크레딧.
 * 돈 행위(입금 확인·발주 확정·크레딧)는 감사 로그(절대 규칙 12). 결제·세금계산서 자동화 없음(규칙 13).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => {
  revalidatePath("/admin/orders", "page");
  revalidatePath("/admin/orders/[id]", "page");
  revalidatePath("/b/[slug]/orders/[id]", "page");
  revalidatePath("/cn/tasks", "page");
};
const slugOf = (o: { brands: unknown }) => ((Array.isArray(o.brands) ? o.brands[0] : o.brands) as { slug?: string } | null)?.slug ?? "";

async function step(orderId: string, to: string, patch: Record<string, unknown> = {}, note?: string) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "common.notFound" };
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, status, brand_id, brands(slug)").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false as const, error: "common.notFound" };
  const res = await applyTransition(db, { entity: "order", id: orderId, from: o.status, to, role: "ADMIN", actorId: admin.id, settings: await getSettings(), patch, note });
  return res.ok ? { ok: true as const, admin, order: o } : res;
}

/** 예약 → 재고 확인중 (CN에 넘김) */
export async function startStockCheck(orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const r = await step(orderId, "stock_checking");
  if (!r.ok) return r;
  await notifyOrderCnOwners(orderId, "order.stock_check");
  revalidate();
  return { ok: true, data: null };
}

/** 재고 부족 → 다시 확인 */
export async function recheckStock(orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const r = await step(orderId, "stock_checking");
  if (!r.ok) return r;
  const db = createAdminClient();
  const { data: short } = await db.from("order_lines").select("id").eq("order_id", orderId).eq("stock_result", "short");
  await applyFieldTransition(db, { entity: "order_line_stock", ids: (short ?? []).map((l) => l.id), from: "short", to: "pending", role: "ADMIN", actorId: r.admin.id });
  await notifyOrderCnOwners(orderId, "order.stock_check");
  revalidate();
  return { ok: true, data: null };
}

/** 선금 안내 (재고 확인 뒤에만 — 전이 테이블이 강제). 선금 = (확보 수량 기준 소계 + 수수료) × 고정 선금율 */
export async function requestDeposit(orderId: string): Promise<Result<{ deposit: number }>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const calc = await loadOrderForCalc(orderId);
  if (!calc) return { ok: false, error: "common.notFound" };
  if (calc.offersChanged) return { ok: false, error: "order.error.offerChanged" };
  if (calc.order.hold_choice !== "deposit" || !calc.order.deposit_pct) return { ok: false, error: "order.error.noHold" };
  const groups = calc.groups.map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, qty: calc.lines.find((x) => x.id === l.lineId)?.confirmed_qty ?? l.qty })) }));
  const deposit = orderDeposit(groups, Number(calc.order.deposit_pct));
  const r = await step(orderId, "deposit_pending", { deposit_krw: deposit });
  if (!r.ok) return r;
  await createAdminClient().from("audit_logs").insert({ actor_id: r.admin.id, action: "order.deposit_request", entity: "order", entity_id: orderId, diff: { deposit_krw: deposit, deposit_pct: calc.order.deposit_pct, brand_id: calc.order.brand_id } });
  await notify({ type: "order.deposit_requested", orderId, brandId: calc.order.brand_id, brandSlug: slugOf(calc.order) });
  revalidate();
  return { ok: true, data: { deposit } };
}

/** 선금 입금 확인 → 홀딩 확정 (감사 로그 payment.confirm) */
export async function confirmDeposit(orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const r = await step(orderId, "hold_confirmed", { deposit_confirmed_at: new Date().toISOString() });
  if (!r.ok) return r;
  const { data: o } = await createAdminClient().from("orders").select("deposit_krw, brand_id").eq("id", orderId).single();
  await createAdminClient().from("audit_logs").insert({ actor_id: r.admin.id, action: "payment.confirm", entity: "order", entity_id: orderId, diff: { deposit_krw: o?.deposit_krw, brand_id: o?.brand_id } });
  revalidate();
  return { ok: true, data: null };
}

/** 견적 시작 (재고 확인 또는 홀딩 확정 뒤) */
export async function startQuote(orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  // 체인: 선금 홀딩을 고른 발주서는 입금 확인(hold_confirmed) 뒤에만 견적 (재고 확인 → 선금 → 홀딩 → 범위 견적)
  const { data: o } = await createAdminClient().from("orders").select("status, hold_choice").eq("id", orderId).maybeSingle();
  if (o?.hold_choice === "deposit" && o.status !== "hold_confirmed") return { ok: false, error: "order.error.depositFirst" };
  const r = await step(orderId, "quoting");
  if (!r.ok) return r;
  revalidate();
  return { ok: true, data: null };
}

/** 범위 견적 자동 초안 (settings 단가 × 중량 × 수량 범위) — 관리자가 조정 */
export async function draftRangeQuote(orderId: string): Promise<Result<{ min: number; max: number }>> {
  if (!Id.safeParse(orderId).success || !(await requireAdmin())) return { ok: false, error: "common.invalid" };
  const calc = await loadOrderForCalc(orderId);
  if (!calc) return { ok: false, error: "common.notFound" };
  if (calc.offersChanged) return { ok: false, error: "order.error.offerChanged" };
  const s = await getSettings();
  let min = 0, max = 0;
  for (const g of calc.groups) {
    const offer = calc.offers.find((o) => o.id === g.offerId)!;
    const p = calc.products.find((x) => x.id === offer.product_id);
    const qtyExp = g.lines.reduce((n, l) => n + (calc.lines.find((x) => x.id === l.lineId)?.confirmed_qty ?? calc.lines.find((x) => x.id === l.lineId)?.expected_qty ?? 0), 0);
    const unit = [...offer.price_tiers].sort((a: { min_qty: number }, b: { min_qty: number }) => a.min_qty - b.min_qty)[0]?.product_price_krw ?? 0;
    const e = logisticsEstimateKrw({ qty_min: Math.round(qtyExp * (1 - s.quote_margin_pct)), qty_max: Math.round(qtyExp * (1 + s.quote_margin_pct)), weight_g: p?.weight_g ?? 0, per_kg_krw: s.logistics_estimate_per_kg_krw, customs_rate: s.customs_estimate_rate, goods_value_krw_per_unit: unit });
    min += e.min_krw;
    max += e.max_krw;
  }
  return { ok: true, data: { min, max } };
}

const RangeSchema = z.object({ min: z.number().int().min(0), max: z.number().int().min(0), note: z.string().trim().max(500).optional().or(z.literal("")) }).refine((v) => v.max >= v.min);
/** 범위 견적 발송 (quoting → quoted, 브랜드 차례) */
export async function submitRangeQuote(orderId: string, input: unknown): Promise<Result<null>> {
  const parsed = RangeSchema.safeParse(input);
  if (!Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const r = await step(orderId, "quoted", { logistics_quote_range: { min_krw: parsed.data.min, max_krw: parsed.data.max }, quote_note: parsed.data.note || null, quoted_at: new Date().toISOString() });
  if (!r.ok) return r;
  await createAdminClient().from("audit_logs").insert({ actor_id: r.admin.id, action: "order.quote_range", entity: "order", entity_id: orderId, diff: { min_krw: parsed.data.min, max_krw: parsed.data.max, brand_id: r.order.brand_id } });
  await notify({ type: "order.quoted", orderId, brandId: r.order.brand_id, brandSlug: slugOf(r.order) });
  revalidate();
  return { ok: true, data: null };
}

/** 최종 견적 (qty_confirmed → final_quoted) — 물류 실비 추정 확정값 */
export async function submitFinalQuote(orderId: string, input: unknown): Promise<Result<null>> {
  const parsed = z.object({ final: z.number().int().min(0), note: z.string().trim().max(500).optional().or(z.literal("")) }).safeParse(input);
  if (!Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const r = await step(orderId, "final_quoted", { logistics_quote_final_krw: parsed.data.final, quote_note: parsed.data.note || null, final_quoted_at: new Date().toISOString() });
  if (!r.ok) return r;
  await createAdminClient().from("audit_logs").insert({ actor_id: r.admin.id, action: "order.quote_final", entity: "order", entity_id: orderId, diff: { logistics_final_krw: parsed.data.final, brand_id: r.order.brand_id } });
  await notify({ type: "order.final_quoted", orderId, brandId: r.order.brand_id, brandSlug: slugOf(r.order) });
  revalidate();
  return { ok: true, data: null };
}

/**
 * 발주 확정 (final_quoted → confirmed): 청구 내역(invoice_snapshot) 고정 — 라벨 옵션 KRW, 미회수 샘플 1회 차감, 선금·크레딧 차감, 최종 물류.
 * 라인 단가(공급가) 고정, 차감한 샘플에 deducted_in_order_id, 브랜드 크레딧 사용분 차감. 감사 로그 order.confirm. 세금계산서는 플랫폼 밖.
 */
export async function confirmOrder(orderId: string): Promise<Result<{ total: number }>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const calc = admin && (await loadOrderForCalc(orderId));
  if (!admin || !calc) return { ok: false, error: "common.notFound" };
  if (calc.offersChanged) return { ok: false, error: "order.error.offerChanged" };
  if (calc.order.status !== "final_quoted") return { ok: false, error: "common.staleState" };
  const o = calc.order;
  const { base, draft } = finalInvoiceParts(calc);
  // 브랜드 동의(u-10): 지금 최종 견적 이후의 동의 + 동의한 총액 = 지금 계산. 아니면 확정하지 않는다
  const approval = finalApprovalState(await latestFinalApproval(orderId), o.final_quoted_at, draft.total_krw);
  if (approval !== "ok") return { ok: false, error: approval === "changed" ? "order.error.approvalChanged" : "order.error.notApproved" };
  const db = createAdminClient();
  const now = new Date().toISOString();
  // 1) 발주서를 먼저 잠근다(final_quoted → confirmed 낙관적 잠금) — 같은 발주서 이중 확정 불가
  const res = await applyTransition(db, {
    entity: "order", id: orderId, from: "final_quoted", to: "confirmed", role: "ADMIN", actorId: admin.id, settings: await getSettings(),
    patch: { confirmed_by: admin.id, confirmed_at: now },
  });
  if (!res.ok) return res;
  // 2) 차감·합산 자원 선점 — 같은 브랜드의 다른 발주서와 동시에 확정돼도 한 번만 (7단계 리뷰 1·3). 선점한 것만 청구 내역에 넣는다
  const claimS = await applyFieldTransition(db, {
    entity: "sample_item_charge", ids: draft.deducted_sample_ids, from: "charged", to: "deducted", role: "ADMIN", actorId: admin.id,
    patch: { deducted_in_order_id: orderId }, diff: { order_id: orderId }, allowPartial: true,
  });
  const gotSamples = new Set(claimS.ok ? claimS.ids : (claimS.ids ?? []));
  const wantLogistics = calc.sampleLogistics.map((x) => x.sampleRequestId);
  const { data: gotL } = wantLogistics.length
    ? await db.from("sample_requests").update({ logistics_billed_order_id: orderId }).in("id", wantLogistics).is("logistics_billed_order_id", null).select("id")
    : { data: [] as { id: string }[] };
  const gotLogistics = new Set((gotL ?? []).map((x) => x.id));
  const claimed = {
    ...base,
    keptSamples: calc.keptSamples.filter((k) => gotSamples.has(k.sampleItemId)),
    sample_logistics: calc.sampleLogistics.filter((x) => gotLogistics.has(x.sampleRequestId)),
  };
  // 3) 크레딧: 잔액과 (크레딧 전 합계) 중 작은 값을 원자적으로 사용
  const beforeCredit = orderInvoice(claimed).total_krw;
  // 발주별 1회 (0041): 사용액을 차감과 같은 트랜잭션에 orders.credit_used_krw로 남긴다 — 재시도·rebuild가 다시 빼지 않는다 (리뷰 MED-3)
  const creditRes = await db.rpc("use_brand_credit_for_order", { p_order: orderId, p_max: Math.max(0, beforeCredit) });
  if (creditRes.error) {
    // 크레딧 RPC 실패를 0원 사용으로 조용히 넘기지 않는다 — 선점(샘플 차감·물류비)은 orderId를 들고 있으므로 재시도(rebuildInvoice)로 복구 가능 (r5 리뷰 3)
    await db.from("audit_logs").insert({ actor_id: admin.id, action: "order.confirm_error", entity: "order", entity_id: orderId, diff: { step: "use_brand_credit", message: creditRes.error.message } });
    return { ok: false, error: "common.error" };
  }
  const credit = Number(creditRes.data ?? 0);
  const inv = orderInvoice({ ...claimed, credit_krw: credit });
  await db.from("orders").update({ invoice_snapshot: { ...inv, issued_at: now } }).eq("id", orderId);
  for (const g of inv.groups) for (const l of calc.groups.find((x) => x.offerId === g.offerId)?.lines ?? []) await db.from("order_lines").update({ unit_price_krw: g.unit_effective_krw }).eq("id", l.lineId);
  await db.from("audit_logs").insert({
    actor_id: admin.id, action: "order.confirm", entity: "order", entity_id: orderId,
    diff: { total_krw: inv.total_krw, credit_used: credit, sample_deduction: inv.sample_deduction_krw, sample_logistics: inv.sample_logistics_krw, brand_id: o.brand_id },
  });
  await keepExportSnapshot(db, admin.id, orderId, o.brand_id);
  await notify({ type: "order.confirmed", orderId, brandId: o.brand_id, brandSlug: slugOf(o) });
  await notifyOrderCnOwners(orderId, "order.ship");
  revalidate();
  return { ok: true, data: { total: inv.total_krw } };
}

/** B-12 패키지용 상품 스냅샷(DECISIONS 9-7). 실패해도 확정은 유지 — 감사 로그만, [청구 내역 다시 만들기]가 빠진 것만 다시 채운다 */
async function keepExportSnapshot(db: ReturnType<typeof createAdminClient>, actorId: string, orderId: string, brandId: string) {
  const s = await snapshotOrderProducts(db, orderId, brandId).catch(() => ({ ok: false, count: 0 }));
  if (!s.ok) await db.from("audit_logs").insert({ actor_id: actorId, action: "order.export_snapshot_error", entity: "order", entity_id: orderId, diff: { saved: s.count } });
}

const AFTER_CONFIRM = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"];
/**
 * [청구 내역 다시 만들기] 확정 중간 실패 복구 (DECISIONS r5-3). 새로 선점하지 않는다 — 이 발주서가 이미 들고 있는
 * 차감 샘플(deducted_in_order_id)·물류비(logistics_billed_order_id)·사용 크레딧(orders.credit_used_krw)으로만 다시 계산한다.
 * 크레딧 단계 전에 실패했으면(사용 기록 없음) 그때만 원자적으로 사용한다. snapshot이 있으면 force일 때만.
 */
export async function rebuildInvoice(orderId: string, force = false): Promise<Result<{ total: number }>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const calc = admin && (await loadOrderForCalc(orderId));
  if (!admin || !calc) return { ok: false, error: "common.notFound" };
  const o = calc.order;
  if (!AFTER_CONFIRM.includes(o.status)) return { ok: false, error: "common.staleState" };
  if (o.invoice_snapshot && !force) return { ok: false, error: "admin.orders.invoiceExists" };
  const db = createAdminClient();
  const [{ data: kept }, { data: billed }] = await Promise.all([
    db.from("sample_items").select("id, charged_krw, offers!inner(product_id)").eq("deducted_in_order_id", orderId),
    db.from("sample_requests").select("id, logistics_fee_krw").eq("logistics_billed_order_id", orderId),
  ]);
  const keptSamples = (kept ?? []).flatMap((k) => {
    const pid = ((Array.isArray(k.offers) ? k.offers[0] : k.offers) as { product_id: string } | null)?.product_id;
    const target = calc.offers.find((x) => x.product_id === pid);
    return target ? [{ sampleItemId: k.id, offerId: target.id, charged_krw: k.charged_krw, already_deducted: false }] : [];
  });
  const qtyByOffer = new Map(calc.groups.map((g) => [g.offerId, g.lines.reduce((n, l) => n + l.qty, 0)]));
  const options = orderOptionLines({
    optionPrices: calc.offers.map((x) => ({ offerId: x.id, option_prices: x.option_prices })),
    labels: (o.label_selections ?? []) as { offerId: string; type: string; qty: number }[],
    mods: (o.mod_requests ?? []) as { offerId: string; item: string }[],
    qtyByOffer,
  });
  const claimed = {
    groups: calc.groups, options, deposit_paid_krw: o.deposit_confirmed_at ? (o.deposit_krw ?? 0) : 0, logistics_final_krw: o.logistics_quote_final_krw,
    keptSamples, sample_logistics: (billed ?? []).filter((b) => b.logistics_fee_krw > 0).map((b) => ({ sampleRequestId: b.id, krw: b.logistics_fee_krw })),
  };
  // 이미 쓴 크레딧이 있으면 그 값(credit_used_krw), 없으면 이번에 1회만 — 같은 함수라 동시에 두 번 눌러도 한 번 (0041)
  const priorUsed = o.credit_used_krw as number | null;
  const r = await db.rpc("use_brand_credit_for_order", { p_order: orderId, p_max: Math.max(0, orderInvoice(claimed).total_krw) });
  if (r.error) return { ok: false, error: "common.error" };
  const credit = Number(r.data ?? 0);
  const now = new Date().toISOString();
  const inv = orderInvoice({ ...claimed, credit_krw: credit });
  await db.from("orders").update({ invoice_snapshot: { ...inv, issued_at: (o.invoice_snapshot as { issued_at?: string } | null)?.issued_at ?? o.confirmed_at ?? now, rebuilt_at: now } }).eq("id", orderId);
  for (const g of inv.groups) for (const l of calc.groups.find((x) => x.offerId === g.offerId)?.lines ?? []) await db.from("order_lines").update({ unit_price_krw: g.unit_effective_krw }).eq("id", l.lineId);
  await db.from("audit_logs").insert({
    actor_id: admin.id, action: "order.invoice_rebuild", entity: "order", entity_id: orderId,
    diff: { total_krw: inv.total_krw, credit_used: credit, credit_newly_used: priorUsed == null, sample_deduction: inv.sample_deduction_krw, sample_logistics: inv.sample_logistics_krw, force, brand_id: o.brand_id },
  });
  await keepExportSnapshot(db, admin.id, orderId, o.brand_id);
  revalidate();
  return { ok: true, data: { total: inv.total_krw } };
}

/** 중국 출고 뒤: 검품 경유(kr_inspecting) 또는 직송(sent_to_brand) */
export async function receiveOrder(orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const { data: o } = await createAdminClient().from("orders").select("route").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "common.notFound" };
  if (o.route !== "inspect") return { ok: false, error: "order.error.directRoute" };
  const r = await step(orderId, "kr_inspecting", { kr_inspected_at: null });
  if (!r.ok) return r;
  revalidate();
  return { ok: true, data: null };
}

const InspectionSchema = z.object({
  results: z.array(z.object({ field: z.string().max(40), expected: z.string().max(200), actual: z.string().max(200), match: z.boolean(), note: z.string().max(300).optional() })).min(1).max(150),
  lines: z.array(z.object({ lineId: Id, okQty: z.number().int().min(0) })).max(200),
  defectQty: z.number().int().min(0),
});
/** 본품 검품 (기준서 = 상품 정보 필드 1:1) → inspections(bulk) + 정보 일치율(KPI) */
export async function submitBulkInspection(orderId: string, input: unknown): Promise<Result<{ rate: number | null }>> {
  const parsed = InspectionSchema.safeParse(input);
  if (!Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, status, brand_id").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "kr_inspecting") return { ok: false, error: "common.staleState" };
  const { data: lines } = await db.from("order_lines").select("id, qty").eq("order_id", orderId);
  if (parsed.data.lines.some((x) => { const l = (lines ?? []).find((y) => y.id === x.lineId); return !l || x.okQty > l.qty; })) return { ok: false, error: "common.invalid" };
  if (parsed.data.defectQty > (lines ?? []).reduce((n, l) => n + l.qty, 0)) return { ok: false, error: "common.invalid" };
  const rate = infoMatchRate(parsed.data.results);
  const { data: ins, error } = await db.from("inspections").insert({
    type: "bulk", target_id: orderId, brand_id: o.brand_id, results: parsed.data.results, defect_qty: parsed.data.defectQty, info_match_rate: rate, inspected_by: admin.id,
  }).select("id").single();
  if (error || !ins) return { ok: false, error: "common.error" };
  for (const l of parsed.data.lines) await db.from("order_lines").update({ inspected_ok_qty: l.okQty }).eq("id", l.lineId).eq("order_id", orderId);
  await db.from("orders").update({ inspection_id: ins.id, kr_inspected_at: new Date().toISOString() }).eq("id", orderId);
  revalidate();
  return { ok: true, data: { rate } };
}

/** 브랜드 발송 (kr_inspecting → sent_to_brand, 직송이면 cn_shipped → sent_to_brand). 검품 경유인데 검품이 없으면 거부 */
export async function sendOrderToBrand(orderId: string, tracking: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success || !z.string().trim().min(4).max(60).safeParse(tracking).success) return { ok: false, error: "common.invalid" };
  const { data: o } = await createAdminClient().from("orders").select("status, route, inspection_id").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "common.notFound" };
  if (o.status === "kr_inspecting" && !o.inspection_id) return { ok: false, error: "order.error.needInspection" };
  if (o.status === "cn_shipped" && o.route !== "direct") return { ok: false, error: "order.error.needInspection" };
  const r = await step(orderId, "sent_to_brand", { sent_at: new Date().toISOString(), kr_tracking: tracking.trim() });
  if (!r.ok) return r;
  await notify({ type: "order.sent", orderId, brandId: r.order.brand_id, brandSlug: slugOf(r.order) });
  revalidate();
  return { ok: true, data: null };
}

const BackorderSchema = z.object({ qty: z.number().int().min(0), eta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), note: z.string().trim().min(1).max(300), resolved: z.boolean().default(false) });
/** 미송 관리 (라인별 수량·예상 입고일·위아더 대응 기록) — 브랜드에 투명하게 보인다 */
export async function updateBackorder(lineId: string, input: unknown): Promise<Result<null>> {
  const parsed = BackorderSchema.safeParse(input);
  if (!Id.safeParse(lineId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: l } = await db.from("order_lines").select("id, order_id, qty, backorder_status, orders(brand_id, status, brands(slug))").eq("id", lineId).maybeSingle();
  if (!l) return { ok: false, error: "common.notFound" };
  const ost = ((Array.isArray(l.orders) ? l.orders[0] : l.orders) as { status?: string } | null)?.status ?? "";
  if (!["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"].includes(ost)) return { ok: false, error: "common.staleState" };
  if (parsed.data.qty > l.qty) return { ok: false, error: "common.invalid" };
  const t = await applyFieldTransition(db, {
    entity: "order_line_backorder", ids: [lineId], from: l.backorder_status, to: parsed.data.resolved ? "resolved" : "backordered", role: "ADMIN", actorId: admin.id,
    patch: { backorder_qty: parsed.data.resolved ? 0 : parsed.data.qty, backorder_eta: parsed.data.eta ?? null }, diff: { qty: parsed.data.qty, eta: parsed.data.eta ?? null },
  });
  if (!t.ok) return t;
  // 기록은 원자적 append (0037, r5 리뷰 11) — 브랜드 선택과 동시에 써도 덮어쓰지 않는다
  const { error: le } = await db.rpc("append_backorder_log", { p_line: lineId, p_entry: { at: new Date().toISOString(), by: "admin", qty: parsed.data.qty, eta: parsed.data.eta ?? null, note: parsed.data.note, resolved: parsed.data.resolved } });
  if (le) return { ok: false, error: "common.error" };
  const ord = (Array.isArray(l.orders) ? l.orders[0] : l.orders) as { brand_id: string; brands: unknown } | null;
  if (ord) await notify({ type: "order.backorder", orderId: l.order_id, brandId: ord.brand_id, brandSlug: slugOf(ord) });
  revalidate();
  return { ok: true, data: null };
}

/** 검수 보고 처리: 불량 크레딧 확정(다음 발주 차감). 금액은 불량 수량 × 공급가 기본, 관리자 조정 가능.
 *  적립 + 발주서 표시 + 감사 로그를 RPC issue_order_credit(0053) 한 트랜잭션으로 — 동시 클릭 시 이중 적립 차단(검증 B-2) */
export async function issueOrderCredit(orderId: string, amount: unknown): Promise<Result<{ credit: number }>> {
  const parsed = z.number().int().min(0).max(100_000_000).optional().safeParse(amount);
  if (!Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, status, brand_id, credit_issued_krw, brands(slug, credit_balance_krw)").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "report_done" || o.credit_issued_krw > 0) return { ok: false, error: "common.staleState" };
  const { data: lines } = await db.from("order_lines").select("defect_qty, unit_price_krw").eq("order_id", orderId);
  const suggested = creditAmount(lines ?? []);
  const credit = parsed.data ?? suggested;
  const { error } = await db.rpc("issue_order_credit", { p_order: orderId, p_amount: credit, p_actor: admin.id, p_suggested: suggested });
  if (error) return { ok: false, error: error.code === "P0003" ? "common.staleState" : "common.error" };
  await notify({ type: "order.credit", orderId, brandId: o.brand_id, brandSlug: slugOf(o) });
  revalidate();
  return { ok: true, data: { credit } };
}

export async function adminCancelOrder(orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const { data: o } = await createAdminClient().from("orders").select("deposit_confirmed_at").eq("id", orderId).maybeSingle();
  // 선금이 들어온 건이면 감사 로그에 남긴다 — 환불은 플랫폼 밖 (DECISIONS r5-12)
  const r = await step(orderId, "cancelled", {}, o?.deposit_confirmed_at ? `deposit_confirmed_at=${o.deposit_confirmed_at}` : undefined);
  if (!r.ok) return r;
  revalidate();
  return { ok: true, data: null };
}

/** 재고 응답 재집계: 여러 CN이 동시에 응답해 집계 전이가 빠진 경우(모든 라인 응답됐는데 stock_checking) (7단계 리뷰 8) */
export async function reaggregateStock(orderId: string): Promise<Result<{ next: string | null }>> {
  if (!Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "stock_checking") return { ok: false, error: "common.staleState" };
  const { data: all } = await db.from("order_lines").select("stock_result").eq("order_id", orderId);
  const next = stockAggregate(all ?? []);
  if (!next) return { ok: false, error: "admin.orders.stockPending" };
  const res = await applyTransition(db, { entity: "order", id: orderId, from: "stock_checking", to: next, role: "ADMIN", actorId: admin.id, settings: await getSettings() });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: { next } };
}
