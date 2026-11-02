import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { kstDay } from "@/lib/offers";
import { feedbackOverdue, returnOverdue } from "@/lib/samples";
import { cnGateOpen, fxDrifted, offerExpired, slaOverdue } from "@/lib/cron-rules";

/**
 * 8단계 배치 본체 (app/api/cron/[job]). 모든 상태 변경은 applyTransition(시스템 행위자 actorId=null, 감사 로그 남음),
 * 모든 알림은 notify(). 같은 대상에 같은 기한으로 두 번 알리지 않는다(sla_alerts).
 */
const slugOf = (b: unknown) => ((Array.isArray(b) ? b[0] : b) as { slug?: string } | null)?.slug ?? "";

/** 처음 알리는 (entity, id, 기준시각)만 true — sla_alerts 기본키 충돌이면 이미 알린 것 */
async function firstAlert(entity: string, entityId: string, dueAt: string) {
  const { data } = await createAdminClient().from("sla_alerts").upsert({ entity, entity_id: entityId, due_at: dueAt }, { onConflict: "entity,entity_id,due_at", ignoreDuplicates: true }).select("entity");
  return !!data?.length;
}

/** SLA 기한 초과 → 담당에게 instant 1회 (CN 담당 지연은 위아더가 챙긴다 → ADMIN) */
export async function slaJob(now = new Date()) {
  const db = createAdminClient();
  const iso = now.toISOString();
  const [ri, pr, of, sr, od] = await Promise.all([
    db.from("request_items").select("id, request_id, owner_role, due_at, brand_id, brands(slug, status)").lt("due_at", iso).not("owner_role", "is", null).order("due_at", { ascending: false }).limit(500),
    db.from("products").select("id, owner_role, due_at").lt("due_at", iso).not("owner_role", "is", null).order("due_at", { ascending: false }).limit(500),
    db.from("offers").select("id, owner_role, due_at, brand_id, brands(slug, status)").lt("due_at", iso).not("owner_role", "is", null).order("due_at", { ascending: false }).limit(500),
    db.from("sample_requests").select("id, owner_role, due_at, brand_id, brands(slug, status)").lt("due_at", iso).not("owner_role", "is", null).order("due_at", { ascending: false }).limit(500),
    db.from("orders").select("id, owner_role, due_at, brand_id, brands(slug, status)").lt("due_at", iso).not("owner_role", "is", null).order("due_at", { ascending: false }).limit(500),
  ]);
  type Row = { id: string; owner_role: string | null; due_at: string | null; brand_id?: string; brands?: unknown; request_id?: string };
  const links: Record<string, (r: Row, brand: boolean) => string> = {
    request_item: (r, b) => (b ? `/b/${slugOf(r.brands)}/requests/${r.request_id}` : `/admin/requests/${r.request_id}`),
    product: (r) => `/admin/products/${r.id}`,
    offer: (r, b) => (b ? `/b/${slugOf(r.brands)}/offers` : `/admin/offers`),
    sample_request: (r, b) => (b ? `/b/${slugOf(r.brands)}/samples/${r.id}` : `/admin/samples/${r.id}`),
    order: (r, b) => (b ? `/b/${slugOf(r.brands)}/orders/${r.id}` : `/admin/orders/${r.id}`),
  };
  let alerted = 0;
  for (const [entity, res] of [["request_item", ri], ["product", pr], ["offer", of], ["sample_request", sr], ["order", od]] as const) {
    for (const r of (res.data ?? []) as Row[]) {
      const toBrand = r.owner_role === "BRAND" && !!r.brand_id;
      // 정지 브랜드 멤버에게는 기한 알림을 보내지 않는다 (DECISIONS r7-12) — 위아더·CN 담당 건은 계속. 기록 전에 걸러 재개 뒤 알림이 살아 있게
      if (toBrand && ((Array.isArray(r.brands) ? r.brands[0] : r.brands) as { status?: string } | null)?.status !== "active") continue;
      if (!slaOverdue(r, now) || !(await firstAlert(entity, r.id, r.due_at!))) continue;
      await notify({ type: "sla.overdue", entity, entityId: r.id, audience: toBrand ? "brand" : "admin", brandId: r.brand_id ?? null, link: links[entity](r, toBrand), cn: r.owner_role === "CN" });
      alerted++;
    }
  }
  return { alerted };
}

/** 제안 유효기간 경과 → expired (브랜드 digest) */
export async function offersJob(now = new Date()) {
  const db = createAdminClient();
  const today = kstDay(now);
  const settings = await getSettings();
  const { data } = await db.from("offers").select("id, status, valid_until, brand_id, request_item_id, brands(slug), request_items(request_id)").in("status", ["new", "interested", "hold"]).lt("valid_until", today).limit(500);
  let expired = 0;
  for (const o of data ?? []) {
    if (!offerExpired(o, today)) continue;
    const r = await applyTransition(db, { entity: "offer", id: o.id, from: o.status, to: "expired", role: "ADMIN", actorId: null, settings, note: "valid_until" });
    if (!r.ok) continue;
    expired++;
    const reqId = ((Array.isArray(o.request_items) ? o.request_items[0] : o.request_items) as { request_id?: string } | null)?.request_id ?? null;
    await notify({ type: "offer.expired", brandId: o.brand_id, brandSlug: slugOf(o.brands), requestId: reqId });
  }
  return { expired };
}

/** 환율 ±fx_recheck_pct: 발행 환율 대비 변동이 크면 상품을 재확인으로(걸린 제안은 트리거가 가림, 재승인 때 현재 환율로 재계산) */
/**
 * 환율 재확인: 기준을 넘은 살아 있는 제안의 상품 → recheck. 한 번에 제안 FX_SCAN_LIMIT건까지 —
 * 이미 recheck인 상품의 제안은 처음부터 빼고 읽으므로, 상한에 걸려도 다음 실행(새벽 크론)이 남은 것을 이어서 본다 (DECISIONS r8-6).
 */
export const FX_SCAN_LIMIT = 2000;
export async function fxJob() {
  const db = createAdminClient();
  const s = await getSettings();
  const { data: offers } = await db.from("offers").select("product_id, fx_rate, products!inner(status)").in("status", ["new", "interested", "hold", "reconsent_pending"]).in("products.status", ["offering", "repool"]).limit(FX_SCAN_LIMIT);
  const scanned = offers?.length ?? 0;
  const capped = scanned >= FX_SCAN_LIMIT;
  const productIds = [...new Set((offers ?? []).filter((o) => fxDrifted(Number(o.fx_rate), s.fx_rate_cny_krw, s.fx_recheck_pct)).map((o) => o.product_id))];
  if (!productIds.length) return { products: 0, scanned, capped };
  const { data: products } = await db.from("products").select("id, status").in("id", productIds).in("status", ["offering", "repool"]);
  let n = 0;
  for (const p of products ?? []) {
    const r = await applyTransition(db, { entity: "product", id: p.id, from: p.status, to: "recheck", role: "ADMIN", actorId: null, settings: s, patch: { recheck_reason: "fx" }, note: `fx:${s.fx_rate_cny_krw}` });
    if (!r.ok) continue;
    n++;
    await notify({ type: "product.fx_recheck", productId: p.id });
  }
  return { products: n, scanned, capped };
}

/** 샘플 피드백·회수 기한 경과 → 관리자 instant 1회 (청구·마감은 수동 유지) */
export async function samplesJob(now = new Date()) {
  const db = createAdminClient();
  const { data: reqs } = await db.from("sample_requests").select("id, status, feedback_due, return_due").in("status", ["delivered", "feedback_done"]).limit(500);
  const ids = (reqs ?? []).map((r) => r.id);
  const { data: items } = ids.length ? await db.from("sample_items").select("sample_request_id, status, return_status, charge_status, return_requested_at").in("sample_request_id", ids) : { data: [] };
  let n = 0;
  for (const r of reqs ?? []) {
    if (r.status === "delivered" && feedbackOverdue(r.feedback_due, now) && (await firstAlert("sample_feedback", r.id, `${r.feedback_due}T00:00:00Z`))) {
      await notify({ type: "sample.feedback_overdue", sampleId: r.id });
      n++;
    }
    const its = (items ?? []).filter((i) => i.sample_request_id === r.id);
    if (its.some((i) => returnOverdue(i, r.return_due, now)) && (await firstAlert("sample_return", r.id, `${r.return_due}T00:00:00Z`))) {
      await notify({ type: "sample.return_overdue", sampleId: r.id });
      n++;
    }
  }
  return { alerted: n };
}

/** CN 질문 4시간 게이트: 관리자가 보류하지 않았으면 브랜드에 자동 노출 (PRD D17) */
export async function cnGateJob(now = new Date()) {
  const db = createAdminClient();
  const { data } = await db.from("cn_questions").select("id, released_at, held_by_admin, admin_gate_until, brand_id, brands(slug), request_items(request_id)").is("released_at", null).is("answered_at", null).eq("held_by_admin", false).not("body_ko", "is", null).lte("admin_gate_until", now.toISOString()).limit(200);
  let n = 0;
  for (const q of data ?? []) {
    if (!cnGateOpen(q, now)) continue;
    // 읽은 뒤 관리자가 보류·답변했으면 노출하지 않는다 (리뷰 MED-2). 번역이 없는 질문은 관리자가 문구를 넣을 때까지 둔다 (LOW-5)
    const { data: upd } = await db.from("cn_questions").update({ released_at: now.toISOString() }).eq("id", q.id).is("released_at", null).eq("held_by_admin", false).is("answered_at", null).not("body_ko", "is", null).select("id");
    if (!upd?.length) continue;
    n++;
    const reqId = ((Array.isArray(q.request_items) ? q.request_items[0] : q.request_items) as { request_id?: string } | null)?.request_id ?? "";
    await notify({ type: "cn_question.released", brandId: q.brand_id, brandSlug: slugOf(q.brands), requestId: reqId });
  }
  return { released: n };
}
