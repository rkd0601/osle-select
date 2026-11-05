import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertTransition, TransitionError, type Entity, type FieldEntity } from "@/lib/transitions";
import { ownerAndDue } from "@/lib/sla";
import type { Role, Settings } from "@/lib/config";

const TABLE: Record<Entity, string> = {
  request_item: "request_items",
  product: "products",
  offer: "offers",
  sample_request: "sample_requests",
  order: "orders",
};

/**
 * 상태 전이 한 곳 (CLAUDE.md 절대 규칙 4): assertTransition → ownerAndDue → update(낙관적 잠금: 현재 status 일치 시만)
 * → audit_logs(action='transition', 타임라인 원천). 서비스 롤 클라이언트로 호출한다.
 * 다른 필드를 같이 바꿀 때는 patch로 넘긴다(같은 update 안에서 원자적으로).
 */
export async function applyTransition(
  db: SupabaseClient,
  args: {
    entity: Entity;
    id: string;
    from: string;
    to: string;
    role: Role;
    /** brand_members.can_purchase (owner는 true). 구매 전이(샘플 요청·발주 확정 등)에만 쓰인다. */
    canPurchase?: boolean;
    /** null = 시스템(배치). 감사 로그는 actor 없이 남는다 */
    actorId: string | null;
    settings: Settings;
    ctx?: { sla_date?: Date | null; exclusive_until?: Date | null };
    patch?: Record<string, unknown>;
    onBehalfOfBrandId?: string | null;
    note?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    assertTransition(args.entity, args.from, args.to, { role: args.role, canPurchase: args.canPurchase });
  } catch (e) {
    if (e instanceof TransitionError) return { ok: false, error: "common.forbidden" };
    throw e;
  }
  const { owner_role, due_at } = ownerAndDue(args.entity, args.to, new Date(), args.settings, args.ctx);
  const { data, error } = await db
    .from(TABLE[args.entity])
    .update({ ...args.patch, status: args.to, owner_role, due_at: due_at?.toISOString() ?? null })
    .eq("id", args.id)
    .eq("status", args.from)
    .select("id");
  if (error) return { ok: false, error: "common.error" };
  if (!data?.length) return { ok: false, error: "common.staleState" }; // 다른 사람이 먼저 바꿨다
  await db.from("audit_logs").insert({
    actor_id: args.actorId,
    action: "transition",
    entity: args.entity,
    entity_id: args.id,
    diff: { from: args.from, to: args.to, ...(args.note ? { note: args.note } : {}) },
    on_behalf_of_brand_id: args.onBehalfOfBrandId ?? null,
  });
  return { ok: true };
}

const FIELD: Record<FieldEntity, { table: string; column: string }> = {
  sample_item: { table: "sample_items", column: "status" },
  sample_item_return: { table: "sample_items", column: "return_status" },
  sample_item_charge: { table: "sample_items", column: "charge_status" },
  order_line_stock: { table: "order_lines", column: "stock_result" },
  order_line_backorder: { table: "order_lines", column: "backorder_status" },
  brand: { table: "brands", column: "status" },
};

/**
 * 항목·라인 필드 전이 (DECISIONS r4 #9): assertTransition → update(낙관적 잠금: 현재 값 일치 시만) → audit_logs.
 * 여러 id를 한 번에(같은 from) 바꿀 수 있다 — 바뀐 행 수가 다르면 staleState.
 */
export async function applyFieldTransition(
  db: SupabaseClient,
  args: {
    entity: FieldEntity; ids: string[]; from: string; to: string; role: Role; canPurchase?: boolean; actorId: string | null;
    patch?: Record<string, unknown>; onBehalfOfBrandId?: string | null; diff?: Record<string, unknown>;
    /** 선점(claim) 용도: 일부만 바뀌어도 성공으로, 실제 바뀐 id를 돌려준다 */
    allowPartial?: boolean;
  },
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string; ids?: string[] }> {
  if (!args.ids.length) return { ok: true, ids: [] };
  try {
    assertTransition(args.entity, args.from, args.to, { role: args.role, canPurchase: args.canPurchase });
  } catch (e) {
    if (e instanceof TransitionError) return { ok: false, error: "common.forbidden" };
    throw e;
  }
  const f = FIELD[args.entity];
  const { data, error } = await db.from(f.table).update({ ...args.patch, [f.column]: args.to }).in("id", args.ids).eq(f.column, args.from).select("id");
  if (error) return { ok: false, error: "common.error" };
  // 실제로 바뀐 행은 부분 실패여도 감사 로그를 남긴다 (7단계 리뷰 4)
  const changed = (data ?? []).map((x: { id: string }) => x.id);
  if (changed.length) {
    await db.from("audit_logs").insert(changed.map((id) => ({
      actor_id: args.actorId, action: "transition", entity: args.entity, entity_id: id,
      diff: { from: args.from, to: args.to, ...(args.diff ?? {}) }, on_behalf_of_brand_id: args.onBehalfOfBrandId ?? null,
    })));
  }
  if (changed.length !== args.ids.length && !args.allowPartial) return { ok: false, error: "common.staleState", ids: changed };
  return { ok: true, ids: changed };
}
