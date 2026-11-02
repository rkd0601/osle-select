"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

/**
 * 용어 사전 관리 (PRD 5장·D12). 번역은 approved=true 용어만 주입한다(lib/translate#glossary). glossary는 authenticated revoke(0005) → 서비스 롤.
 * 모든 변경은 감사 로그 glossary.*.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const Term = z.object({ zh: z.string().trim().min(1).max(40), ko: z.string().trim().min(1).max(40), category: z.string().trim().max(30).optional() });

async function guard() {
  return requireAdmin();
}
const audit = (actorId: string, action: string, id: string | null, diff: Record<string, unknown>) =>
  createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, entity: "glossary", entity_id: id, diff });
const done = () => revalidatePath("/admin/glossary");

export async function addTerm(input: unknown): Promise<Result<null>> {
  const p = Term.safeParse(input);
  if (!p.success) return { ok: false, error: "common.invalid" };
  const admin = await guard();
  if (!admin) return { ok: false, error: "common.notFound" };
  const { data, error } = await createAdminClient()
    .from("glossary")
    .upsert({ term_zh: p.data.zh, term_ko: p.data.ko, category: p.data.category || null, approved: true, added_by: admin.id }, { onConflict: "term_zh,term_ko" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "common.error" };
  await audit(admin.id, "glossary.add", data.id, { zh: p.data.zh, ko: p.data.ko });
  done();
  return { ok: true, data: null };
}

export async function approveTerm(id: string, approved: boolean): Promise<Result<null>> {
  if (!Id.safeParse(id).success) return { ok: false, error: "common.invalid" };
  const admin = await guard();
  if (!admin) return { ok: false, error: "common.notFound" };
  const { data } = await createAdminClient().from("glossary").update({ approved }).eq("id", id).select("id");
  if (!data?.length) return { ok: false, error: "common.notFound" };
  await audit(admin.id, approved ? "glossary.approve" : "glossary.unapprove", id, {});
  done();
  return { ok: true, data: null };
}

export async function updateTerm(id: string, input: unknown): Promise<Result<null>> {
  const p = Term.safeParse(input);
  if (!Id.safeParse(id).success || !p.success) return { ok: false, error: "common.invalid" };
  const admin = await guard();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: before } = await db.from("glossary").select("term_zh, term_ko, category").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "common.notFound" };
  const { error } = await db.from("glossary").update({ term_zh: p.data.zh, term_ko: p.data.ko, category: p.data.category || null }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "glossary.error.duplicate" : "common.error" };
  await audit(admin.id, "glossary.update", id, { before, after: { term_zh: p.data.zh, term_ko: p.data.ko, category: p.data.category || null } });
  done();
  return { ok: true, data: null };
}

export async function deleteTerm(id: string): Promise<Result<null>> {
  if (!Id.safeParse(id).success) return { ok: false, error: "common.invalid" };
  const admin = await guard();
  if (!admin) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data } = await db.from("glossary").delete().eq("id", id).select("term_zh, term_ko");
  if (!data?.length) return { ok: false, error: "common.notFound" };
  await audit(admin.id, "glossary.delete", id, { term: data[0] });
  done();
  return { ok: true, data: null };
}
