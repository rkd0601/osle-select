import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * 내 알림 (사용자 세션 + RLS notifications_self, 0034 컬럼 grant — 발송 기록 컬럼은 읽을 수 없다).
 */
export async function listMyNotifications(limit = 100) {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, kind, type, title, link_path, read_at, created_at").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function unreadCount() {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}
