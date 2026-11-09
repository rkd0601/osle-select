"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { idsForPath } from "@/lib/unseen";

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

/**
 * 화면을 열면 그 화면을 가리키는 읽지 않은 알림을 읽음으로 (사이트 수정 7·8 — "새 소식" 칩이 열어 본 뒤 사라지게).
 * 본인 행·read_at 컬럼만(RLS + 0034 grant). 바뀐 건수를 돌려준다 — 0이면 화면을 새로 그리지 않는다.
 */
export async function markPathRead(path: unknown): Promise<Result<number>> {
  const parsed = z.string().min(1).max(300).startsWith("/").safeParse(path);
  if (!parsed.success) return { ok: false, error: "common.invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "common.notFound" };
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, link_path").eq("recipient_id", user.id).is("read_at", null).not("link_path", "is", null).limit(500);
  const ids = idsForPath(data ?? [], parsed.data);
  if (!ids.length) return { ok: true, data: 0 };
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null).in("id", ids.slice(0, 200));
  if (error) return { ok: false, error: "common.error" };
  revalidatePath("/", "layout");
  return { ok: true, data: ids.length };
}
