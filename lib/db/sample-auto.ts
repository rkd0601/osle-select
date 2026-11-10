import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { allResolved } from "@/lib/samples";

/**
 * 업무 단순화 v1 S3 (PRD 2026-11-10): 샘플 요청서는 모든 항목이 회수 또는 구매 확정으로 끝나면 자동으로 닫는다.
 * feedback_done일 때만 — 전이는 시스템(actor null)으로 applyTransition(감사·SLA). 이미 닫혔거나 남은 항목이 있으면 아무것도 안 한다.
 */
export async function autoCloseSampleIfResolved(db: SupabaseClient, sampleId: string): Promise<boolean> {
  const [{ data: sr }, { data: items }] = await Promise.all([
    db.from("sample_requests").select("status").eq("id", sampleId).maybeSingle(),
    db.from("sample_items").select("return_status, charge_status, status").eq("sample_request_id", sampleId),
  ]);
  if (!sr || sr.status !== "feedback_done" || !items?.length || !allResolved(items)) return false;
  const res = await applyTransition(db, { entity: "sample_request", id: sampleId, from: "feedback_done", to: "closed", role: "ADMIN", actorId: null, settings: await getSettings(), note: "auto_close" });
  return res.ok;
}
