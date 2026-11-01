"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCn, type Actor } from "@/lib/auth/guards";
import { applyFieldTransition, applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { StockResponse, stockAggregate } from "@/lib/orders";

/**
 * C-05 발주 처리: 재고 확인 응답(라인별 확보/부족 + 확보 수량 + 메모) · 출고(라인 단위, 모두 출고 시 cn_shipped).
 * CN은 본인 상품 라인만. 한 발주서에 여러 원청이 섞이면 각자 자기 라인을 응답·출고한다.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function myLines(actor: Actor, orderId: string) {
  const db = createAdminClient();
  const { data: lines } = await db.from("order_lines").select("id, offer_id, stock_result, expected_qty, cn_shipped_at").eq("order_id", orderId);
  if (actor.role === "ADMIN") return lines ?? [];
  const { data: offers } = await db.from("offers").select("id, product_id").in("id", (lines ?? []).map((l) => l.offer_id));
  const { data: mine } = await db.from("products").select("id").eq("created_by", actor.id).in("id", (offers ?? []).map((o) => o.product_id));
  const pids = new Set((mine ?? []).map((p) => p.id));
  return (lines ?? []).filter((l) => pids.has((offers ?? []).find((o) => o.id === l.offer_id)?.product_id ?? ""));
}

export async function respondStock(orderId: string, input: unknown): Promise<Result<{ next: string | null }>> {
  const parsed = StockResponse.safeParse(input);
  if (!z.guid().safeParse(orderId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "stock_checking") return { ok: false, error: "common.staleState" };
  const mine = await myLines(actor, orderId);
  const allowed = new Set(mine.map((l) => l.id));
  if (parsed.data.some((r) => !allowed.has(r.lineId))) return { ok: false, error: "common.forbidden" };
  for (const r of parsed.data) {
    const line = mine.find((l) => l.id === r.lineId)!;
    const confirmed = r.result === "confirmed" ? Math.min(r.confirmedQty || line.expected_qty, line.expected_qty) : Math.min(r.confirmedQty, line.expected_qty);
    const patch = { confirmed_qty: confirmed, cn_note: r.note || null };
    if (line.stock_result === r.result) await db.from("order_lines").update(patch).eq("id", r.lineId).eq("stock_result", r.result);
    else {
      const t = await applyFieldTransition(db, { entity: "order_line_stock", ids: [r.lineId], from: line.stock_result, to: r.result, role: actor.role, actorId: actor.id, patch, diff: { confirmed_qty: confirmed } });
      if (!t.ok) return t;
    }
  }
  const { data: all } = await db.from("order_lines").select("stock_result").eq("order_id", orderId);
  const next = stockAggregate(all ?? []);
  if (next) {
    const res = await applyTransition(db, { entity: "order", id: orderId, from: "stock_checking", to: next, role: actor.role, actorId: actor.id, settings: await getSettings() });
    if (res.ok) await notify({ type: "order.stock_done", orderId });
  }
  revalidatePath("/cn/tasks", "page");
  revalidatePath("/admin/orders/[id]", "page");
  return { ok: true, data: { next } };
}

export async function shipOrderLines(orderId: string, tracking: string): Promise<Result<null>> {
  if (!z.guid().safeParse(orderId).success || !z.string().trim().min(4).max(60).safeParse(tracking).success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "confirmed") return { ok: false, error: "common.staleState" }; // 발주 확정 전 출고 불가 (체인)
  const pending = (await myLines(actor, orderId)).filter((l) => !l.cn_shipped_at);
  if (!pending.length) return { ok: false, error: "common.notFound" };
  const now = new Date().toISOString();
  await db.from("order_lines").update({ cn_tracking: tracking.trim(), cn_shipped_at: now }).in("id", pending.map((l) => l.id));
  const { data: left } = await db.from("order_lines").select("id").eq("order_id", orderId).is("cn_shipped_at", null).gt("qty", 0);
  if (!left?.length) {
    await applyTransition(db, { entity: "order", id: orderId, from: "confirmed", to: "cn_shipped", role: actor.role, actorId: actor.id, settings: await getSettings(), patch: { cn_shipped_at: now } });
  }
  revalidatePath("/cn/tasks", "page");
  revalidatePath("/admin/orders/[id]", "page");
  return { ok: true, data: null };
}
