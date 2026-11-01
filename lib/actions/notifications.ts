"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** 읽음 표시 (ids 없으면 전부). 본인 행·read_at 컬럼만 — RLS + 0034 grant가 강제 */
export async function markNotificationsRead(ids?: unknown): Promise<Result<null>> {
  const parsed = z.array(z.guid()).max(200).optional().safeParse(ids);
  if (!parsed.success) return { ok: false, error: "common.invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "common.notFound" };
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null);
  if (parsed.data?.length) q = q.in("id", parsed.data);
  const { error } = await q;
  if (error) return { ok: false, error: "common.error" };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
