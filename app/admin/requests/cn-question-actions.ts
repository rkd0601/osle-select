"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";

/**
 * A-02 CN 질문 게이트 (PRD D17): 질문은 4시간 동안 관리자만 본다. 그 안에 보류·문구 수정·바로 노출·직접 답변.
 * 보류도 답변도 없으면 cn_gate 배치가 브랜드에 노출한다. 모든 행위는 감사 로그.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = () => {
  revalidatePath("/admin/requests/[id]", "page");
  revalidatePath("/b/[slug]/requests/[id]", "page");
  revalidatePath("/cn/items/[id]", "page");
};

async function load(id: string) {
  const { data } = await createAdminClient()
    .from("cn_questions")
    .select("id, request_item_id, brand_id, asked_by, body_ko, options, released_at, held_by_admin, answered_at, brands(slug), request_items(request_id)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
const audit = (actorId: string, action: string, id: string, diff: Record<string, unknown>) =>
  createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, entity: "cn_question", entity_id: id, diff });

/** 보류(브랜드 노출 막기) / 보류 해제 — 노출 전·미답변일 때만 */
export async function holdCnQuestion(id: string, hold: boolean): Promise<Result<null>> {
  if (!Id.safeParse(id).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const q = admin && (await load(id));
  if (!admin || !q) return { ok: false, error: "common.notFound" };
  if (q.released_at || q.answered_at) return { ok: false, error: "common.staleState" };
  const { data } = await createAdminClient().from("cn_questions").update({ held_by_admin: hold }).eq("id", id).is("released_at", null).select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(admin.id, "cn_question.hold", id, { hold });
  revalidate();
  return { ok: true, data: null };
}

const EditSchema = z.object({ bodyKo: z.string().trim().min(1).max(500), optionsKo: z.array(z.string().trim().min(1).max(60)).max(6) });
/** 브랜드에 보일 한국어 문구 다듬기 — 원문(zh)은 그대로, 노출 전만 */
export async function editCnQuestion(id: string, input: unknown): Promise<Result<null>> {
  const parsed = EditSchema.safeParse(input);
  if (!Id.safeParse(id).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const q = admin && (await load(id));
  if (!admin || !q) return { ok: false, error: "common.notFound" };
  if (q.released_at || q.answered_at) return { ok: false, error: "common.staleState" };
  const opts = (q.options ?? []) as { zh: string; ko: string | null }[];
  if (parsed.data.optionsKo.length !== opts.length) return { ok: false, error: "common.invalid" };
  const { data } = await createAdminClient()
    .from("cn_questions")
    .update({ body_ko: parsed.data.bodyKo, options: opts.map((o, i) => ({ ...o, ko: parsed.data.optionsKo[i] })) })
    .eq("id", id).is("released_at", null).select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(admin.id, "cn_question.edit", id, { before: q.body_ko, after: parsed.data.bodyKo });
  revalidate();
  return { ok: true, data: null };
}

/** 4시간을 기다리지 않고 바로 브랜드에 노출 */
export async function releaseCnQuestion(id: string): Promise<Result<null>> {
  if (!Id.safeParse(id).success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const q = admin && (await load(id));
  if (!admin || !q) return { ok: false, error: "common.notFound" };
  if (q.released_at || q.answered_at || !q.body_ko) return { ok: false, error: "common.staleState" };
  const { data } = await createAdminClient().from("cn_questions").update({ released_at: new Date().toISOString(), held_by_admin: false }).eq("id", id).is("released_at", null).is("answered_at", null).not("body_ko", "is", null).select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(admin.id, "cn_question.release", id, {});
  const slug = ((Array.isArray(q.brands) ? q.brands[0] : q.brands) as { slug?: string } | null)?.slug ?? "";
  const reqId = ((Array.isArray(q.request_items) ? q.request_items[0] : q.request_items) as { request_id?: string } | null)?.request_id ?? "";
  await notify({ type: "cn_question.released", brandId: q.brand_id, brandSlug: slug, requestId: reqId });
  revalidate();
  return { ok: true, data: null };
}

const AnswerSchema = z.object({ answer: z.string().trim().min(1).max(500) });
/** 위아더가 직접 답변 (브랜드에 묻지 않아도 되는 질문). 노출 전이면 노출하지 않고 닫힌다 */
export async function answerCnQuestionAdmin(id: string, input: unknown): Promise<Result<null>> {
  const parsed = AnswerSchema.safeParse(input);
  if (!Id.safeParse(id).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const admin = await requireAdmin();
  const q = admin && (await load(id));
  if (!admin || !q) return { ok: false, error: "common.notFound" };
  if (q.answered_at) return { ok: false, error: "common.staleState" };
  const tr = await translate({ from: "ko", to: "zh-CN", segments: [{ field: "cn_answer", text: parsed.data.answer }] });
  const { data } = await createAdminClient()
    .from("cn_questions")
    .update({ answer: parsed.data.answer, answer_zh: tr.ok ? tr.data[0] : null, answered_by: admin.id, answered_at: new Date().toISOString() })
    .eq("id", id).is("answered_at", null).select("id");
  if (!data?.length) return { ok: false, error: "common.staleState" };
  await audit(admin.id, "cn_question.answer", id, { by: "admin", translated: tr.ok });
  if (q.asked_by) await notify({ type: "cn_question.answered", askerId: q.asked_by, itemId: q.request_item_id });
  revalidate();
  return { ok: true, data: null };
}
