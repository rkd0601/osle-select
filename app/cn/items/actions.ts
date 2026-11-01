"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCn } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { cnQuestionGateUntil } from "@/lib/sla";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";
import { slaDateToDue } from "@/lib/requests";

/** C-01 내 요청 항목. 배정자 본인만(assigned_to = actor). 상태 변경은 applyTransition. */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.string().uuid();

async function loadAssigned(itemId: string, actorId: string, isAdmin: boolean) {
  const { data } = await createAdminClient().from("request_items").select("id, request_id, brand_id, status, assigned_to, sla_date").eq("id", itemId).maybeSingle();
  if (!data || (!isAdmin && data.assigned_to !== actorId)) return null;
  return data;
}

/** 开始寻找: assigned → sourcing */
export async function startSourcing(itemId: string): Promise<Result<null>> {
  if (!Id.safeParse(itemId).success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const item = actor && (await loadAssigned(itemId, actor.id, actor.role === "ADMIN"));
  if (!actor || !item) return { ok: false, error: "common.notFound" };
  const res = await applyTransition(createAdminClient(), {
    entity: "request_item", id: itemId, from: item.status, to: "sourcing", role: actor.role, actorId: actor.id,
    settings: await getSettings(), ctx: { sla_date: item.sla_date ? slaDateToDue(item.sla_date) : null },
  });
  if (!res.ok) return res;
  revalidatePath("/cn", "page");
  revalidatePath("/cn/items/[id]", "page");
  return { ok: true, data: null };
}

const AskSchema = z.object({
  bodyZh: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
});

/**
 * 向品牌提问: cn_questions 생성. admin_gate_until = now + 4h (관리자 게이트).
 * 게이트 해제·브랜드 노출·답변은 8단계에서. 지금은 관리자에게 인앱 알림만.
 */
export async function askBrand(itemId: string, input: unknown): Promise<Result<null>> {
  const parsed = AskSchema.safeParse(input);
  if (!Id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const item = actor && (await loadAssigned(itemId, actor.id, actor.role === "ADMIN"));
  if (!actor || !item) return { ok: false, error: "common.notFound" };
  // 취소·보류는 assigned_to를 비우지 않으므로 상태로 막는다(배정·소싱 중에만 질문)
  if (item.status !== "assigned" && item.status !== "sourcing") return { ok: false, error: "common.forbidden" };
  const tr = await translate({ from: "zh-CN", to: "ko", segments: [{ field: "cn_question", text: parsed.data.bodyZh }, ...parsed.data.options.map((o) => ({ field: "cn_question" as const, text: o }))] });
  const ko = tr.ok ? tr.data : null;
  const settings = await getSettings();
  const { error } = await createAdminClient()
    .from("cn_questions")
    .insert({
      request_item_id: itemId,
      brand_id: item.brand_id,
      asked_by: actor.id,
      body_zh: parsed.data.bodyZh,
      body_ko: ko?.[0] ?? null,
      options: parsed.data.options.map((zh, i) => ({ zh, ko: ko?.[i + 1] ?? null })),
      admin_gate_until: cnQuestionGateUntil(new Date(), settings).toISOString(),
    });
  if (error) return { ok: false, error: "common.error" };
  await notify({ type: "cn_question.created", requestId: item.request_id, itemId });
  revalidatePath("/cn/items/[id]", "page");
  return { ok: true, data: null };
}
