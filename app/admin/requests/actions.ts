"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { insertRequest } from "@/lib/db/requests.write";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";
import { intakeSlaDate, ownerAndDue } from "@/lib/sla";
import { listCnStaff } from "@/lib/db/admin/requests";
import { tk } from "@/lib/i18n/admin";
import { NEEDS_INFO_REASONS, RequestInput, isEditableByAdmin, slaDateToDue } from "@/lib/requests";
import { QTY_RANGES } from "@/lib/codes";

/** A-02 요청 접수·배정. 모든 액션: ADMIN 확인 → 서비스 롤. 상태 변경은 applyTransition만. */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => {
  revalidatePath("/admin/requests", "page");
  revalidatePath("/admin/requests/[id]", "page");
  revalidatePath("/admin", "page");
};

async function loadItem(itemId: string) {
  const { data } = await createAdminClient()
    .from("request_items")
    .select("id, request_id, brand_id, seq, status, description, description_zh, assigned_to, brands(slug)")
    .eq("id", itemId)
    .maybeSingle();
  return data;
}

/** 관리자 대행 입력 (브랜드 선택) — created_via=admin_proxy, audit on_behalf_of_brand */
export async function createRequestOnBehalf(brandId: string, input: unknown): Promise<Result<{ requestId: string }>> {
  const parsed = RequestInput.safeParse(input);
  if (!Id.safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const res = await insertRequest(createAdminClient(), { brandId, actorId: admin.id, createdVia: "admin_proxy", input: parsed.data, settings: await getSettings() });
  if (!res.ok) return res;
  await notify({ type: "request.created", brandId, requestId: res.data.requestId, itemCount: res.data.itemCount });
  revalidate();
  return { ok: true, data: { requestId: res.data.requestId } };
}

const ItemPatch = z.object({
  category: z.string().trim().max(30).nullable().optional(),
  description: z.string().trim().min(1).max(200).optional(),
  descriptionZh: z.string().trim().max(400).nullable().optional(),
  targetPriceKrw: z.number().int().min(0).max(10_000_000).nullable().optional(),
  expectedQtyRange: z.enum(QTY_RANGES).nullable().optional(),
});

/** 항목 정리: 내용·카테고리·중국어 설명 수정. 중국어 설명은 배정 후에도 고칠 수 있다(CN 화면에 바로 반영). */
export async function updateRequestItem(itemId: string, patch: unknown): Promise<Result<null>> {
  const parsed = ItemPatch.safeParse(patch);
  if (!Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const item = admin && (await loadItem(itemId));
  if (!admin || !item) return { ok: false, error: "common.notFound" };
  const p = parsed.data;
  const contentChange = p.category !== undefined || p.description !== undefined || p.targetPriceKrw !== undefined || p.expectedQtyRange !== undefined;
  if (contentChange && !isEditableByAdmin(item.status)) return { ok: false, error: "common.staleState" };
  const { error } = await createAdminClient()
    .from("request_items")
    .update({
      ...(p.category !== undefined && { category: p.category }),
      ...(p.description !== undefined && { description: p.description }),
      ...(p.descriptionZh !== undefined && { description_zh: p.descriptionZh }),
      ...(p.targetPriceKrw !== undefined && { target_price_krw: p.targetPriceKrw }),
      ...(p.expectedQtyRange !== undefined && { expected_qty_range: p.expectedQtyRange }),
    })
    .eq("id", itemId);
  if (error) return { ok: false, error: "common.error" };
  revalidate();
  return { ok: true, data: null };
}

/** 중국어 번역 초안 (저장하지 않음 — 관리자가 확인 후 저장). 원가 필드는 보내지 않는다. */
export async function suggestTranslation(text: string, field: "item_description" | "request_memo"): Promise<Result<string>> {
  if (typeof text !== "string" || text.length > 2000 || !["item_description", "request_memo"].includes(field)) return { ok: false, error: "common.invalid" };
  if (!(await requireAdmin())) return { ok: false, error: "common.notFound" };
  const res = await translate({ from: "ko", to: "zh-CN", segments: [{ field, text }] });
  return res.ok ? { ok: true, data: res.data[0] } : res;
}

export async function updateRequestMemoZh(requestId: string, memoZh: string): Promise<Result<null>> {
  if (!Id.safeParse(requestId).success || typeof memoZh !== "string" || memoZh.length > 4000) return { ok: false, error: "common.invalid" };
  if (!(await requireAdmin())) return { ok: false, error: "common.notFound" };
  const { error } = await createAdminClient().from("requests").update({ memo_zh: memoZh.trim() || null }).eq("id", requestId);
  if (error) return { ok: false, error: "common.error" };
  revalidate();
  return { ok: true, data: null };
}

/** 항목 분리: 같은 요청에 새 항목 추가 (received). 이미지는 moveRequestImage로 옮긴다. */
export async function addRequestItem(requestId: string, input: unknown): Promise<Result<{ itemId: string }>> {
  const parsed = z.object({ description: z.string().trim().min(1).max(200), category: z.string().trim().max(30).optional() }).safeParse(input);
  if (!Id.safeParse(requestId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: req } = await db.from("requests").select("id, brand_id").eq("id", requestId).maybeSingle();
  if (!req) return { ok: false, error: "common.notFound" };
  const { data: last } = await db.from("request_items").select("seq").eq("request_id", requestId).order("seq", { ascending: false }).limit(1).maybeSingle();
  const { owner_role, due_at } = ownerAndDue("request_item", "received", new Date(), await getSettings());
  const { data, error } = await db
    .from("request_items")
    .insert({
      request_id: requestId, brand_id: req.brand_id, seq: (last?.seq ?? 0) + 1, description: parsed.data.description,
      category: parsed.data.category || null, status: "received", owner_role, due_at: due_at?.toISOString() ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "common.error" };
  await db.from("audit_logs").insert({ actor_id: admin.id, action: "request_item.split", entity: "request_item", entity_id: data.id, diff: { request_id: requestId } });
  revalidate();
  return { ok: true, data: { itemId: data.id } };
}

/** 이미지를 다른 항목으로 (같은 요청 안에서만) */
export async function moveRequestImage(imageId: string, toItemId: string): Promise<Result<null>> {
  if (!Id.safeParse(imageId).success || !Id.safeParse(toItemId).success) return { ok: false, error: "common.invalid" };
  if (!(await requireAdmin())) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const [{ data: img }, item] = await Promise.all([db.from("request_images").select("id, request_id").eq("id", imageId).maybeSingle(), loadItem(toItemId)]);
  if (!img || !item || img.request_id !== item.request_id) return { ok: false, error: "common.notFound" };
  if (!isEditableByAdmin(item.status)) return { ok: false, error: "common.staleState" };
  await db.from("request_images").update({ request_item_id: toItemId }).eq("id", imageId);
  revalidate();
  return { ok: true, data: null };
}

/** 항목 병합: source의 이미지를 target으로 옮기고 source는 취소 */
export async function mergeRequestItems(sourceId: string, targetId: string): Promise<Result<null>> {
  if (!Id.safeParse(sourceId).success || !Id.safeParse(targetId).success || sourceId === targetId) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const [src, dst] = await Promise.all([loadItem(sourceId), loadItem(targetId)]);
  if (!src || !dst || src.request_id !== dst.request_id) return { ok: false, error: "common.notFound" };
  if (!isEditableByAdmin(src.status) || !isEditableByAdmin(dst.status)) return { ok: false, error: "common.staleState" };
  const db = createAdminClient();
  const res = await applyTransition(db, {
    entity: "request_item", id: sourceId, from: src.status, to: "cancelled", role: "ADMIN", actorId: admin.id,
    settings: await getSettings(), note: `merged_into:${targetId}`,
  });
  if (!res.ok) return res;
  await db.from("request_images").update({ request_item_id: targetId }).eq("request_item_id", sourceId);
  revalidate();
  return { ok: true, data: null };
}

/** 보완 요청: received → needs_info(BRAND, 2일). 사유는 템플릿 키, 한 줄 메모 선택. */
export async function requestMoreInfo(itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = z.object({ reason: z.enum(NEEDS_INFO_REASONS), note: z.string().trim().max(300).optional() }).safeParse(input);
  if (!Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const item = admin && (await loadItem(itemId));
  if (!admin || !item) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const res = await applyTransition(db, {
    entity: "request_item", id: itemId, from: item.status, to: "needs_info", role: "ADMIN", actorId: admin.id,
    settings: await getSettings(), note: parsed.data.reason,
  });
  if (!res.ok) return res;
  const body = [tk(`needsInfo.reason.${parsed.data.reason}`), parsed.data.note].filter(Boolean).join(" — ");
  await db.from("comments").insert({ target_type: "request_item", target_id: itemId, brand_id: item.brand_id, author_id: admin.id, visibility: "brand", body_ko: body });
  const brand = Array.isArray(item.brands) ? item.brands[0] : item.brands;
  await notify({ type: "request_item.needs_info", brandId: item.brand_id, brandSlug: brand?.slug ?? "", requestId: item.request_id, itemSeq: item.seq });
  revalidate();
  return { ok: true, data: null };
}

/**
 * CN 배정: received|on_hold → assigned(CN, sla_date). 이미 assigned/sourcing이면 담당자·기한만 바꾼다(재배정).
 * 중국어 설명이 없으면 거부 — CN 화면은 중국어만 보여준다.
 */
export async function assignRequestItem(itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = z.object({ assigneeId: Id, slaDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
  if (!Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const item = admin && (await loadItem(itemId));
  if (!admin || !item) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: u } = await db.auth.admin.getUserById(parsed.data.assigneeId);
  const role = u?.user?.app_metadata?.role;
  if (role !== "CN_SOURCER" && role !== "CN_VENDOR") return { ok: false, error: "common.invalid" };
  const res = await assignOne(db, admin.id, item, parsed.data.assigneeId, parsed.data.slaDate);
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}

/** 배정 한 건 (assignRequestItem·intakeAllItems 공용). 담당자 역할 검증은 호출부가 한다. */
async function assignOne(
  db: ReturnType<typeof createAdminClient>, adminId: string,
  item: NonNullable<Awaited<ReturnType<typeof loadItem>>>, assigneeId: string, slaDate: string,
): Promise<Result<null>> {
  if (!item.description_zh?.trim()) return { ok: false, error: "request.error.needZh" };
  const due = slaDateToDue(slaDate);
  if (item.status === "assigned" || item.status === "sourcing") {
    // 재배정은 상태 전이가 아니다. 그 사이 상태가 바뀌었으면(예: assigned→offered) 덮어쓰지 않는다.
    const { owner_role, due_at } = ownerAndDue("request_item", item.status, new Date(), await getSettings(), { sla_date: due });
    const { data: upd } = await db
      .from("request_items")
      .update({ assigned_to: assigneeId, sla_date: slaDate, owner_role, due_at: due_at?.toISOString() ?? null })
      .eq("id", item.id)
      .eq("status", item.status)
      .select("id");
    if (!upd?.length) return { ok: false, error: "common.staleState" };
    await db.from("audit_logs").insert({
      actor_id: adminId, action: "request_item.reassign", entity: "request_item", entity_id: item.id,
      diff: { from: item.assigned_to, to: assigneeId, sla_date: slaDate },
    });
  } else {
    const res = await applyTransition(db, {
      entity: "request_item", id: item.id, from: item.status, to: "assigned", role: "ADMIN", actorId: adminId,
      settings: await getSettings(), ctx: { sla_date: due }, patch: { assigned_to: assigneeId, sla_date: slaDate },
    });
    if (!res.ok) return res;
  }
  await notify({ type: "request_item.assigned", assigneeId, itemId: item.id });
  return { ok: true, data: null };
}

/**
 * A1 접수 한 번에 (NEXT §0-g): 접수(received) 항목 전부 — 중국어 설명이 빈 항목은 번역 초안을 한 번의 호출로 만들어 저장하고,
 * 첫 CN_SOURCER에게 배정한다(기한 = 희망일 − 5일, lib/sla intakeSlaDate). 보완 요청·보류·이미 배정된 항목은 건드리지 않는다.
 * 번역이 안 되면(ANTHROPIC_API_KEY 없음 등) 항목별 초안 버튼과 같은 에러 키를 translateError로 돌려주고,
 * 중국어 설명이 이미 있는 항목만 배정한다(나머지 수 = needZh).
 */
export async function intakeAllItems(requestId: string): Promise<
  Result<{ translated: number; assigned: number; needZh: number; failed: number; translateError: string | null; assignee: string; slaDate: string }>
> {
  if (!Id.safeParse(requestId).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const [{ data: req }, { data: rows }, staff] = await Promise.all([
    db.from("requests").select("id, target_date").eq("id", requestId).maybeSingle(),
    db.from("request_items").select("id, request_id, brand_id, seq, status, description, description_zh, assigned_to, brands(slug)").eq("request_id", requestId).order("seq"),
    listCnStaff(),
  ]);
  if (!req) return { ok: false, error: "common.notFound" };
  const sourcer = staff.find((s) => s.role === "CN_SOURCER");
  if (!sourcer) return { ok: false, error: "admin.request.intake.noSourcer" };
  const targets = (rows ?? []).filter((i) => i.status === "received");
  if (!targets.length) return { ok: false, error: "admin.request.intake.none" };

  let translated = 0;
  let translateError: string | null = null;
  const drafts = targets.filter((i) => !i.description_zh?.trim() && i.description.trim());
  if (drafts.length) {
    const res = await translate({ from: "ko", to: "zh-CN", segments: drafts.map((i) => ({ field: "item_description" as const, text: i.description })) });
    if (!res.ok) translateError = res.error;
    else {
      for (const [k, i] of drafts.entries()) {
        const zh = res.data[k]?.trim();
        if (!zh) continue;
        const { error } = await db.from("request_items").update({ description_zh: zh.slice(0, 400) }).eq("id", i.id).or("description_zh.is.null,description_zh.eq."); // 그 사이 사람이 적은 중국어는 덮어쓰지 않는다
        if (!error) { i.description_zh = zh; translated++; }
      }
    }
  }

  const slaDate = intakeSlaDate(req.target_date, new Date());
  let assigned = 0, needZh = 0, failed = 0;
  for (const i of targets) {
    if (!i.description_zh?.trim()) { needZh++; continue; }
    const r = await assignOne(db, admin.id, i, sourcer.id, slaDate);
    if (r.ok) assigned++; else failed++;
  }
  revalidate();
  return { ok: true, data: { translated, assigned, needZh, failed, translateError, assignee: sourcer.name, slaDate } };
}

/** 단순 전이: 보류(on_hold) · 배정 취소(assigned → received) */
export async function transitionRequestItem(itemId: string, to: "on_hold" | "received"): Promise<Result<null>> {
  if (!Id.safeParse(itemId).success || !["on_hold", "received"].includes(to)) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const item = admin && (await loadItem(itemId));
  if (!admin || !item) return { ok: false, error: "common.notFound" };
  const res = await applyTransition(createAdminClient(), {
    entity: "request_item", id: itemId, from: item.status, to, role: "ADMIN", actorId: admin.id, settings: await getSettings(),
    patch: to === "received" ? { assigned_to: null, sla_date: null } : undefined,
  });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, data: null };
}
