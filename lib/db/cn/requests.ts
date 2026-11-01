import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * CN 세션 요청 쿼리 (C-01). v_request_items_cn: 본인 배정 항목만, CN_VENDOR는 브랜드명·희망 단가 마스킹.
 * 이미지는 request_images RLS(배정 항목)로 읽는다.
 */
const COLS = "id, request_id, seq, category, description_zh, expected_qty_range, status, due_at, sla_date, target_price_krw, brand_label, request_memo_zh, created_at";

export async function listMyItems() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_request_items_cn").select(COLS).order("due_at", { ascending: true, nullsFirst: false });
  return data ?? [];
}

export async function getMyItem(id: string) {
  const supabase = await createClient();
  const { data: item } = await supabase.from("v_request_items_cn").select(COLS).eq("id", id).maybeSingle();
  if (!item) return null;
  const [{ data: images }, { data: questions }] = await Promise.all([
    supabase.from("request_images").select("id, storage_path, source_url, sort_order").eq("request_item_id", id).order("sort_order"),
    supabase.from("cn_questions").select("id, body_zh, options, admin_gate_until, released_at, answer_zh, answer, created_at").eq("request_item_id", id).order("created_at"),
  ]);
  return { item, images: images ?? [], questions: questions ?? [] };
}
