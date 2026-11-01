import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 타임라인 원천: audit_logs(action='transition' | 'request.create' …) + 코멘트.
 * 브랜드에게는 상태·시각·사유 템플릿만 돌려준다(행위자 id·내부 메모 없음). 호출부가 소유를 검증한 id만 넘긴다.
 */
export type TimelineEvent = {
  at: string;
  kind: "created" | "transition" | "comment";
  entityId: string;
  from?: string;
  to?: string;
  text?: string;
  audience: "brand" | "internal" | "cn";
};

export async function transitionEvents(entity: "request_item" | "request", ids: string[]): Promise<TimelineEvent[]> {
  if (!ids.length) return [];
  const { data } = await createAdminClient()
    .from("audit_logs")
    .select("action, entity_id, diff, created_at")
    .eq("entity", entity)
    .in("entity_id", ids)
    .in("action", ["transition", "request.create"])
    .order("created_at");
  return (data ?? []).map((r) => {
    const d = (r.diff ?? {}) as { from?: string; to?: string };
    return r.action === "transition"
      ? { at: r.created_at, kind: "transition" as const, entityId: r.entity_id, from: d.from, to: d.to, audience: "brand" as const }
      : { at: r.created_at, kind: "created" as const, entityId: r.entity_id, audience: "brand" as const };
  });
}
