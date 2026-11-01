"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";
import { itemStatusAfterReactions, slaDateToDue } from "@/lib/requests";
import { kstDay } from "@/lib/offers";
import { productOpenForReaction } from "@/lib/db/admin/products";
import { t } from "@/lib/i18n";

/**
 * B-04 셀렉: 관심 / 보류 / 거절(사유 탭 + 한 줄). 상태 변경은 applyTransition만(재동의는 구매 권한 필요 — Actor.canPurchase).
 * 거절 메모는 용어 사전을 적용해 zh로 번역해 CN에게 전달(코멘트 visibility=cn). 반응 후 요청 항목 집계(모두 거절 → sourcing + CN 알림).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ReactSchema = z.object({
  reaction: z.enum(["interested", "hold", "declined"]),
  reason: z.enum(["price", "design", "fabric", "leadtime", "other"]).optional(),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function reactToOffer(brandId: string, offerId: string, input: unknown): Promise<Result<null>> {
  const parsed = ReactSchema.safeParse(input);
  if (!z.guid().safeParse(brandId).success || !z.guid().safeParse(offerId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const v = parsed.data;
  if (v.reaction === "declined" && !v.reason) return { ok: false, error: "offer.error.needReason" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { data: offer } = await db.from("offers").select("id, status, product_id, request_item_id, brand_id, valid_until").eq("id", offerId).eq("brand_id", brandId).maybeSingle();
  // 재확인 중 제안은 브랜드에게 없는 것과 같다 — ADMIN 대행도 이 경로로 D16 재승인을 건너뛸 수 없다 (리뷰 3)
  if (!offer || offer.status === "recheck") return { ok: false, error: "common.notFound" };
  if (offer.status === v.reaction) return { ok: true, data: null };
  // 유효기간이 지난 가격으로는 반응을 받지 않는다(만료 배치 전이라도) (리뷰 4). 날짜는 KST 기준
  if (offer.valid_until < kstDay(new Date())) return { ok: false, error: "offer.error.expired" };
  // 상품이 재확인·비공개 중이면 "거절 → 관심" 같은 되살리기도 막는다 — recheck 캐스케이드는 declined 제안을 건드리지 않으므로 여기서 닫는다 (r3 리뷰 1)
  if (!(await productOpenForReaction(offer.product_id))) return { ok: false, error: "offer.error.productUnavailable" };

  let noteZh: string | null = null;
  if (v.reaction === "declined" && v.note) {
    const tr = await translate({ from: "ko", to: "zh-CN", segments: [{ field: "decline_note", text: v.note }] });
    noteZh = tr.ok ? tr.data[0] : null;
  }
  const settings = await getSettings();
  const res = await applyTransition(db, {
    entity: "offer", id: offerId, from: offer.status, to: v.reaction, role: access.actor.role, canPurchase: access.canPurchase, actorId: access.actor.id, settings,
    patch: {
      reaction: v.reaction, reacted_by: access.actor.id, reacted_at: new Date().toISOString(),
      decline_reason: v.reaction === "declined" ? v.reason : null, decline_note: v.reaction === "declined" ? v.note || null : null, decline_note_zh: v.reaction === "declined" ? noteZh : null,
    },
    onBehalfOfBrandId: access.onBehalf ? brandId : null,
  });
  if (!res.ok) return res;
  if (v.reaction === "declined") {
    // CN에게는 사유 템플릿(zh) + 번역된 메모만. 브랜드 식별·한국어 원문은 싣지 않는다 (리뷰 2, CN_VENDOR 마스킹)
    const body = [t("zh-CN", `decline.${v.reason}`), noteZh].filter(Boolean).join(" — ");
    await db.from("comments").insert({ target_type: "offer", target_id: offerId, brand_id: null, author_id: access.actor.id, visibility: "cn", body_ko: null, body_zh: body });
  }

  // 요청 항목 집계 (PRD 12장): 모두 거절 → sourcing(+CN 알림), 관심 하나 → selected
  if (offer.request_item_id) {
    const { data: siblings } = await db.from("offers").select("status").eq("request_item_id", offer.request_item_id).eq("brand_id", brandId);
    // sourcing → offered → selected 처럼 두 번 갈 수 있다. 시스템 전이(브랜드 반응의 결과)라 ADMIN 규칙, 행위자는 반응한 사람
    for (let step = 0; step < 2; step++) {
      const { data: item } = await db.from("request_items").select("id, status, assigned_to, sla_date").eq("id", offer.request_item_id).maybeSingle();
      const next = item && itemStatusAfterReactions(item.status, siblings ?? []);
      if (!item || !next) break;
      const r = await applyTransition(db, {
        entity: "request_item", id: item.id, from: item.status, to: next, role: "ADMIN", actorId: access.actor.id, settings, note: `reaction:${offerId}`,
        ctx: { sla_date: item.sla_date ? slaDateToDue(item.sla_date) : null },
      });
      if (!r.ok) break; // 동시 반응이 먼저 바꿨다 — 알림도 그쪽이 보낸다 (리뷰 5)
      if (next === "sourcing" && item.assigned_to) await notify({ type: "offer.all_declined", assigneeId: item.assigned_to, itemId: item.id });
    }
  }
  revalidatePath("/b/[slug]/offers", "page");
  revalidatePath("/b/[slug]/offers/[id]", "page");
  return { ok: true, data: null };
}
