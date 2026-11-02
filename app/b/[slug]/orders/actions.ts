"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { eligibleOffersForBrand, loadOrderForCalc } from "@/lib/db/admin/orders";
import { addBusinessDays, ownerAndDue } from "@/lib/sla";
import { notify } from "@/lib/notify";
import { kstDay } from "@/lib/offers";
import { belowMinQty, orderInvoice, orderOptionLines, qtyOverConfirmed, ReserveInput, scheduleCheck } from "@/lib/orders";

/**
 * B-08 발주서 2단계 · B-09 도착 검수 보고. 구매 행위(예약·수량 확정·취소)는 canPurchase (D10).
 * 담기 조건(절대 규칙 7)·체인 순서는 서버가 강제한다. 결제 자동화 없음 — 선금은 신고까지 (규칙 13).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => {
  revalidatePath("/b/[slug]/orders", "page");
  revalidatePath("/b/[slug]/orders/[id]", "page");
};

/** 1단계 예약 */
export async function reserveOrder(brandId: string, input: unknown): Promise<Result<{ orderId: string; warnings: string[] }>> {
  const parsed = ReserveInput.safeParse(input);
  if (!Id.safeParse(brandId).success || !parsed.success) {
    const m = parsed.success ? "" : (parsed.error.issues[0]?.message ?? "");
    return { ok: false, error: m.startsWith("order.") ? m : "common.invalid" };
  }
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  if (!access.canPurchase) return { ok: false, error: "sample.error.noPurchase" };
  const v = parsed.data;
  if (v.waiveSampleGate && !access.onBehalf) return { ok: false, error: "common.forbidden" }; // 면제는 관리자만 (DECISIONS r5-4)
  const lines = v.lines.filter((l) => l.expectedQty > 0);
  const offers = await eligibleOffersForBrand(brandId, [...new Set(lines.map((l) => l.offerId))], { adminWaived: v.waiveSampleGate });
  if (offers.length !== new Set(lines.map((l) => l.offerId)).size) return { ok: false, error: "common.notFound" };
  if (offers.some((o) => !o.eligible)) return { ok: false, error: "order.error.notEligible" }; // 절대 규칙 7

  const db = createAdminClient();
  const { data: variants } = await db.from("product_variants").select("id, product_id").in("id", lines.map((l) => l.variantId));
  const vmap = new Map((variants ?? []).map((x) => [x.id, x.product_id]));
  if (lines.some((l) => vmap.get(l.variantId) !== offers.find((o) => o.offerId === l.offerId)?.productId)) return { ok: false, error: "common.forbidden" };

  const s = await getSettings();
  const sched = scheduleCheck({ gbClose: v.gbClose, deliveryPromise: v.deliveryPromise }, offers.map((o) => ({ supply_type: o.supplyType, lead_days: o.leadDays })), s.logistics_days);
  if (sched.block) return { ok: false, error: sched.block };
  const groupsQty = offers.map((o) => ({ offerId: o.offerId, qty: lines.filter((l) => l.offerId === o.offerId).reduce((n, l) => n + l.expectedQty, 0), minQty: o.minQty }));
  if (belowMinQty(groupsQty).length) return { ok: false, error: "order.error.minQty" };

  // 홀딩: 선금 선택이면 모든 상품이 선금 홀딩 조건을 가져야 한다. 선금율은 가장 높은 값으로 고정 (D9)
  let depositPct: number | null = null;
  if (v.holdChoice === "deposit") {
    const pcts = offers.map((o) => (o.hold && !("none" in o.hold) ? o.hold.deposit_pct : null));
    if (pcts.some((p) => p == null)) return { ok: false, error: "order.error.noHold" };
    depositPct = Math.max(...(pcts as number[]));
  }
  // 디테일 수정은 MOQ 충족 시만 (F5) — 제안의 option_prices.mods 기준
  for (const m of v.modRequests) {
    const o = offers.find((x) => x.offerId === m.offerId);
    const mod = (o?.option_prices as { mods?: { item: string; moq: number }[] } | null)?.mods?.find((x) => x.item === m.item);
    const qty = groupsQty.find((g) => g.offerId === m.offerId)?.qty ?? 0;
    if (!mod || qty < mod.moq) return { ok: false, error: "order.error.modMoq" };
  }

  const now = new Date();
  const { owner_role, due_at } = ownerAndDue("order", "reserved", now, s);
  const { data: order, error } = await db
    .from("orders")
    .insert({
      brand_id: brandId, created_by: access.actor.id, status: "reserved", owner_role, due_at: due_at?.toISOString() ?? null,
      gb_open_date: v.gbOpen, gb_close_date: v.gbClose, delivery_promise_date: v.deliveryPromise,
      hold_choice: v.holdChoice, hold_ack: v.holdChoice === "none" ? v.holdAck : false, deposit_pct: depositPct, mod_requests: v.modRequests,
      admin_waived: v.waiveSampleGate && offers.some((o) => !o.gatePassed),
    })
    .select("id")
    .single();
  if (error || !order) return { ok: false, error: "common.error" };
  const { error: le } = await db.from("order_lines").insert(lines.map((l) => ({ order_id: order.id, brand_id: brandId, offer_id: l.offerId, variant_id: l.variantId, expected_qty: l.expectedQty })));
  if (le) {
    await db.from("orders").delete().eq("id", order.id);
    return { ok: false, error: "common.error" };
  }
  await db.from("audit_logs").insert({ actor_id: access.actor.id, action: "order.reserve", entity: "order", entity_id: order.id, diff: { lines: lines.length, hold: v.holdChoice }, on_behalf_of_brand_id: access.onBehalf ? brandId : null });
  const waived = offers.filter((o) => !o.gatePassed).map((o) => o.offerId);
  if (v.waiveSampleGate && waived.length) {
    await db.from("audit_logs").insert({ actor_id: access.actor.id, action: "order.waive_sample_gate", entity: "order", entity_id: order.id, diff: { waived: true, offers: waived }, on_behalf_of_brand_id: brandId });
  }
  await notify({ type: "order.reserved", orderId: order.id });
  revalidate();
  return { ok: true, data: { orderId: order.id, warnings: sched.warnings } };
}

async function ownOrder(brandId: string, orderId: string) {
  const { data } = await createAdminClient().from("orders").select("id, status, brand_id, deposit_confirmed_at, report_due").eq("id", orderId).eq("brand_id", brandId).maybeSingle();
  return data;
}

/** 선금 "입금했어요" 신고 — 확인은 관리자 */
export async function reportDeposit(brandId: string, orderId: string, note: unknown): Promise<Result<null>> {
  const n = z.string().trim().max(100).optional().or(z.literal("")).safeParse(note);
  if (!Id.safeParse(brandId).success || !Id.safeParse(orderId).success || !n.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const o = access && (await ownOrder(brandId, orderId));
  if (!access || !o) return { ok: false, error: "common.notFound" };
  if (o.status !== "deposit_pending") return { ok: false, error: "common.staleState" };
  // 상태 조건부 update(TOCTOU) + 관리자 확인 SLA(1영업일)로 기한 재계산 + 감사 로그 — 돈 신고도 기록 (r5-11)
  const s = await getSettings();
  const dueAdmin = addBusinessDays(new Date(), s.intake_sla_days);
  const db = createAdminClient();
  const { data: upd } = await db.from("orders").update({ deposit_reported_at: new Date().toISOString(), deposit_note: n.data || null, owner_role: "ADMIN", due_at: dueAdmin.toISOString() }).eq("id", orderId).eq("status", "deposit_pending").is("deposit_reported_at", null).select("id");
  if (!upd?.length) return { ok: false, error: "common.staleState" };
  await db.from("audit_logs").insert({ actor_id: access.actor.id, action: "order.deposit_report", entity: "order", entity_id: orderId, diff: { note: n.data || null }, on_behalf_of_brand_id: access.onBehalf ? brandId : null });
  await notify({ type: "order.deposit_reported", orderId });
  revalidate();
  return { ok: true, data: null };
}

const ConfirmSchema = z.object({
  lines: z.array(z.object({ lineId: Id, qty: z.number().int().min(0).max(100_000) })).min(1).max(200),
  labels: z.array(z.object({ offerId: Id, type: z.string().max(20), qty: z.number().int().min(0).max(100_000) })).max(50).default([]),
  route: z.enum(["inspect", "direct"]),
});

/** 2단계 수량 확정 (quoted → qty_confirmed): 확보 수량 이내 · 최소 수량 · 라벨 MOQ · 경로 */
export async function confirmOrderQuantities(brandId: string, orderId: string, input: unknown): Promise<Result<{ total: number }>> {
  const parsed = ConfirmSchema.safeParse(input);
  if (!Id.safeParse(brandId).success || !Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  if (!access.canPurchase) return { ok: false, error: "sample.error.noPurchase" };
  const calc = await loadOrderForCalc(orderId);
  if (!calc || calc.order.brand_id !== brandId) return { ok: false, error: "common.notFound" };
  if (calc.order.status !== "quoted") return { ok: false, error: "common.staleState" };
  const want = new Map(parsed.data.lines.map((l) => [l.lineId, l.qty]));
  if ([...want.keys()].some((id) => !calc.lines.some((l) => l.id === id))) return { ok: false, error: "common.forbidden" };
  const lines = calc.lines.map((l) => ({ ...l, qty: want.get(l.id) ?? 0 }));
  if (qtyOverConfirmed(lines).length) return { ok: false, error: "order.error.overConfirmed" };
  const minByOffer = new Map(calc.offers.map((o) => [o.id, calc.products.find((p) => p.id === o.product_id)?.min_qty ?? null]));
  const totals = calc.offers.map((o) => ({ offerId: o.id, qty: lines.filter((l) => l.offer_id === o.id).reduce((n, l) => n + l.qty, 0), minQty: minByOffer.get(o.id) ?? null }));
  if (belowMinQty(totals).length) return { ok: false, error: "order.error.minQty" };
  if (!totals.some((t) => t.qty > 0)) return { ok: false, error: "order.error.empty" };
  for (const lb of parsed.data.labels.filter((x) => x.qty > 0)) {
    const op = (calc.offers.find((o) => o.id === lb.offerId)?.option_prices as { labels?: { type: string; moq: number }[] } | null)?.labels?.find((x) => x.type === lb.type);
    if (!op || lb.qty < op.moq) return { ok: false, error: "order.error.labelMoq" };
  }
  // 예약 때 통과한 디테일 수정 MOQ를 확정 수량으로 다시 검사 — 수량을 줄이면 MOQ 아래로 내려갈 수 있다 (r5 리뷰 13)
  const modReqs = (calc.order.mod_requests ?? []) as { offerId: string; item: string }[];
  for (const m of modReqs) {
    const total = totals.find((t) => t.offerId === m.offerId)?.qty ?? 0;
    const mod = (calc.offers.find((o) => o.id === m.offerId)?.option_prices as { mods?: { item: string; moq: number }[] } | null)?.mods?.find((x) => x.item === m.item);
    if (total > 0 && (!mod || total < mod.moq)) return { ok: false, error: "order.error.modMoq" };
  }
  const db = createAdminClient();
  const s = await getSettings();
  const res = await applyTransition(db, {
    entity: "order", id: orderId, from: "quoted", to: "qty_confirmed", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id, settings: s,
    patch: { label_selections: parsed.data.labels.filter((x) => x.qty > 0), route: parsed.data.route, qty_confirmed_at: new Date().toISOString() },
    onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  // 전이가 성공한 뒤에만 수량을 기록한다 (권한·상태 실패 시 수량이 바뀌지 않게, 7단계 리뷰 7)
  for (const l of lines) await db.from("order_lines").update({ qty: l.qty }).eq("id", l.id).eq("order_id", orderId);
  const inv = orderInvoice({ groups: calc.groups.map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, qty: want.get(l.lineId) ?? 0 })) })) });
  await notify({ type: "order.qty_confirmed", orderId });
  revalidate();
  return { ok: true, data: { total: inv.total_krw } };
}

export async function cancelOrder(brandId: string, orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(brandId).success || !Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const o = access && (await ownOrder(brandId, orderId));
  if (!access || !o) return { ok: false, error: "common.notFound" };
  // 선금 입금이 확인된 발주서는 브랜드가 취소할 수 없다 — 관리자만(환불은 플랫폼 밖) (DECISIONS r4 #7과 같은 원칙, 7단계 리뷰 5)
  if (o.deposit_confirmed_at && access.actor.role !== "ADMIN") return { ok: false, error: "order.error.paidCancel" };
  const res = await applyTransition(createAdminClient(), {
    entity: "order", id: orderId, from: o.status, to: "cancelled", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id,
    settings: await getSettings(), onBehalfOfBrandId: access.onBehalf ? brandId : null, note: o.deposit_confirmed_at ? `deposit_confirmed_at=${o.deposit_confirmed_at}` : undefined,
  });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}

/** 받았어요 (sent_to_brand → delivered) — 검수 보고 기한 7일 시작 */
export async function markOrderDelivered(brandId: string, orderId: string): Promise<Result<null>> {
  if (!Id.safeParse(brandId).success || !Id.safeParse(orderId).success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  const o = access && (await ownOrder(brandId, orderId));
  if (!access || !o) return { ok: false, error: "common.notFound" };
  const s = await getSettings();
  const now = new Date();
  const res = await applyTransition(createAdminClient(), {
    entity: "order", id: orderId, from: o.status, to: "delivered", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id, settings: s,
    patch: { delivered_at: now.toISOString(), report_due: kstDay(new Date(now.getTime() + s.report_days * 86400000)) }, onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}

const ReportSchema = z.object({
  lines: z.array(z.object({ lineId: Id, defectQty: z.number().int().min(0).max(100_000) })).max(200),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
/** B-09 도착 검수 보고 (delivered → report_done): 라인별 불량 수량 + 메모. 크레딧은 관리자가 확정 */
export async function submitOrderReport(brandId: string, orderId: string, input: unknown): Promise<Result<null>> {
  const parsed = ReportSchema.safeParse(input);
  if (!Id.safeParse(brandId).success || !Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: lines } = await db.from("order_lines").select("id, qty").eq("order_id", orderId).eq("brand_id", brandId);
  const o = await ownOrder(brandId, orderId);
  if (!o || !lines) return { ok: false, error: "common.notFound" };
  if (o.status !== "delivered") return { ok: false, error: "common.staleState" };
  if (o.report_due && kstDay(new Date()) > o.report_due && access.actor.role !== "ADMIN") return { ok: false, error: "order.error.reportLate" };
  for (const l of parsed.data.lines) {
    const line = lines.find((x) => x.id === l.lineId);
    if (!line || l.defectQty > line.qty) return { ok: false, error: "common.invalid" };
  }
  const res = await applyTransition(db, {
    entity: "order", id: orderId, from: "delivered", to: "report_done", role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id, settings: await getSettings(),
    patch: { report: { note: parsed.data.note || null, defects: parsed.data.lines.filter((l) => l.defectQty > 0) }, report_submitted_at: new Date().toISOString() },
    onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  for (const l of parsed.data.lines) await db.from("order_lines").update({ defect_qty: l.defectQty }).eq("id", l.lineId).eq("order_id", orderId);
  await notify({ type: "order.reported", orderId });
  revalidate();
  return { ok: true, data: null };
}

const PreviewLines = z.array(z.object({ offerId: Id, qty: z.number().int().min(0).max(100_000) })).max(200);
/** 1단계 예상 금액 (표시용 — tier는 제안별 총수량). 확정 금액은 발주 확정 때 고정된다 */
export async function previewReserve(brandId: string, lines: unknown): Promise<Result<ReturnType<typeof orderInvoice>>> {
  const parsed = PreviewLines.safeParse(lines);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  if (!(await requireBrandAccess(brandId))) return { ok: false, error: "common.notFound" };
  const ids = [...new Set(parsed.data.map((l) => l.offerId))];
  if (!ids.length) return { ok: true, data: orderInvoice({ groups: [] }) };
  const offers = await eligibleOffersForBrand(brandId, ids);
  const groups = offers.map((o) => ({
    offerId: o.offerId, price_tiers: o.price_tiers, fee_rate: o.fee_rate,
    lines: parsed.data.filter((l) => l.offerId === o.offerId).map((l, i) => ({ lineId: `${o.offerId}:${i}`, qty: l.qty })),
  }));
  return { ok: true, data: orderInvoice({ groups }) };
}

/** 2단계 금액 미리보기: 확정 수량 · 라벨 옵션 · 미회수 샘플 차감 · 입금된 선금 (발주 확정과 같은 함수) */
export async function previewOrder(brandId: string, orderId: string, input: unknown): Promise<Result<ReturnType<typeof orderInvoice>>> {
  const parsed = ConfirmSchema.safeParse(input);
  if (!Id.safeParse(brandId).success || !Id.safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  if (!(await requireBrandAccess(brandId))) return { ok: false, error: "common.notFound" };
  const calc = await loadOrderForCalc(orderId);
  if (!calc || calc.order.brand_id !== brandId) return { ok: false, error: "common.notFound" };
  const want = new Map(parsed.data.lines.map((l) => [l.lineId, l.qty]));
  const groups = calc.groups.map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, qty: want.get(l.lineId) ?? 0 })) }));
  const options = orderOptionLines({
    optionPrices: calc.offers.map((x) => ({ offerId: x.id, option_prices: x.option_prices })),
    labels: parsed.data.labels, mods: (calc.order.mod_requests ?? []) as { offerId: string; item: string }[],
    qtyByOffer: new Map(groups.map((g) => [g.offerId, g.lines.reduce((n, l) => n + l.qty, 0)])),
  });
  return {
    ok: true,
    data: orderInvoice({
      groups, options, keptSamples: calc.keptSamples, sample_logistics: calc.sampleLogistics, deposit_paid_krw: calc.order.deposit_confirmed_at ? (calc.order.deposit_krw ?? 0) : 0,
    }),
  };
}

/**
 * 미송 라인에 대한 브랜드 선택 (CLAUDE_CODE_NEXT r4: 브랜드에는 "지연 N일 · 대체/대기/취소" 선택지만).
 * 원청 대응은 위아더가 직접 한다 — 선택은 backorder_log에 기록되고 관리자에게 알림. 금액 조정은 관리자가 크레딧으로.
 */
export async function chooseBackorder(brandId: string, lineId: string, choice: unknown): Promise<Result<null>> {
  const c = z.enum(["substitute", "wait", "cancel"]).safeParse(choice);
  if (!Id.safeParse(brandId).success || !Id.safeParse(lineId).success || !c.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  if (c.data === "cancel" && !access.canPurchase) return { ok: false, error: "sample.error.noPurchase" };
  const db = createAdminClient();
  const { data: l } = await db.from("order_lines").select("id, order_id, backorder_status, backorder_log").eq("id", lineId).eq("brand_id", brandId).maybeSingle();
  if (!l || l.backorder_status !== "backordered") return { ok: false, error: "common.staleState" };
  const log = [...((l.backorder_log ?? []) as unknown[]), { at: new Date().toISOString(), by: "brand", choice: c.data }];
  const { data: upd } = await db.from("order_lines").update({ backorder_log: log }).eq("id", lineId).eq("backorder_status", "backordered").select("id");
  if (!upd?.length) return { ok: false, error: "common.staleState" };
  await db.from("audit_logs").insert({ actor_id: access.actor.id, action: "order.backorder_choice", entity: "order_line", entity_id: lineId, diff: { choice: c.data }, on_behalf_of_brand_id: access.onBehalf ? brandId : null });
  await notify({ type: "order.backorder_choice", orderId: l.order_id });
  revalidate();
  return { ok: true, data: null };
}
