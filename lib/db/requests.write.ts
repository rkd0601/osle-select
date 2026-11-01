import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerAndDue } from "@/lib/sla";
import { isOwnRequestImagePath, requestTitle, type RequestInput } from "@/lib/requests";
import type { Settings } from "@/lib/config";
import { pathsExist } from "@/lib/storage";

/**
 * 요청 + 항목 + 이미지 생성 (B-02 브랜드 / A-02 관리자 대행 공통). 서비스 롤 클라이언트로 호출한다.
 * 항목은 received(ADMIN, 1영업일)로 시작한다. 이미지 경로는 해당 브랜드 prefix만 허용.
 * Supabase JS에는 트랜잭션이 없어 실패 시 요청 행을 지워 되돌린다(cascade).
 */
export async function insertRequest(
  db: SupabaseClient,
  args: { brandId: string; actorId: string; createdVia: "brand" | "admin_proxy"; input: RequestInput; settings: Settings },
): Promise<{ ok: true; data: { requestId: string; itemCount: number } } | { ok: false; error: string }> {
  const { brandId, input } = args;
  if (input.items.some((it) => it.imagePaths.some((p) => !isOwnRequestImagePath(brandId, p)))) return { ok: false, error: "common.forbidden" };
  if (!(await pathsExist("requestImages", input.items.flatMap((it) => it.imagePaths)))) return { ok: false, error: "upload.missing" };

  const { data: req, error: e1 } = await db
    .from("requests")
    .insert({ brand_id: brandId, created_by: args.actorId, title: requestTitle(input), memo: input.memo || null, target_date: input.targetDate || null, created_via: args.createdVia })
    .select("id")
    .single();
  if (e1 || !req) return { ok: false, error: "common.error" };

  const { owner_role, due_at } = ownerAndDue("request_item", "received", new Date(), args.settings);
  const { data: items, error: e2 } = await db
    .from("request_items")
    .insert(
      input.items.map((it, i) => ({
        request_id: req.id,
        brand_id: brandId,
        seq: i + 1,
        category: it.category || null,
        description: it.description,
        target_price_krw: it.targetPriceKrw ?? null,
        expected_qty_range: it.expectedQtyRange || null,
        status: "received",
        owner_role,
        due_at: due_at?.toISOString() ?? null,
      })),
    )
    .select("id, seq");
  if (e2 || !items) {
    await db.from("requests").delete().eq("id", req.id);
    return { ok: false, error: "common.error" };
  }
  const idBySeq = new Map(items.map((r) => [r.seq as number, r.id as string]));
  const images = input.items.flatMap((it, i) => [
    ...it.imagePaths.map((p, k) => ({ storage_path: p, source_url: null, sort_order: k })),
    ...it.links.map((u, k) => ({ storage_path: null, source_url: u, sort_order: 100 + k })),
  ].map((img) => ({ ...img, request_id: req.id, request_item_id: idBySeq.get(i + 1), brand_id: brandId })));
  if (images.length) {
    const { error: e3 } = await db.from("request_images").insert(images);
    if (e3) {
      await db.from("requests").delete().eq("id", req.id);
      return { ok: false, error: "common.error" };
    }
  }
  await db.from("audit_logs").insert({
    actor_id: args.actorId,
    action: "request.create",
    entity: "request",
    entity_id: req.id,
    diff: { items: items.length, created_via: args.createdVia },
    on_behalf_of_brand_id: args.createdVia === "admin_proxy" ? brandId : null,
  });
  return { ok: true, data: { requestId: req.id, itemCount: items.length } };
}
