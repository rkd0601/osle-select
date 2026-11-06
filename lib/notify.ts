import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { t, type Locale } from "@/lib/i18n";
import { listUsersByRole } from "@/lib/db/users";
import { kindOf, type NotifyEvent } from "@/lib/notify-rules";

/**
 * 알림 한 곳 (CLAUDE.md 코딩 규칙). 이벤트 → kind(instant|digest)·수신자·채널 결정.
 * 인앱 = notifications 행. 이메일(브랜드·ADMIN)·WeCom(CN)은 lib/notify-delivery: instant는 응답 뒤 즉시(after) + 5분 배치 재시도,
 * digest는 1일 1회 수신자별 1통(같은 대상은 한 줄 — entity·entity_id가 묶음 키).
 * 문구는 i18n 템플릿 키(notify.<type>.title)로, 수신자 로케일에 맞춰 만든다.
 */
export type { NotifyEvent } from "@/lib/notify-rules";

type Recipient = { id: string; locale: Locale };
/** ADMIN 목록 (JWT app_metadata.role). 요청 단위 캐시 — profiles에 role을 두지 않는 원칙(CLAUDE.md 규칙 8)을 지키면서 listUsers 반복 호출을 줄인다 */
const admins = cache(async (): Promise<Recipient[]> => (await listUsersByRole(["ADMIN"])).map((u) => ({ id: u.id, locale: "ko" as const })));
async function brandMembers(brandId: string): Promise<Recipient[]> {
  const { data } = await createAdminClient().from("brand_members").select("profile_id").eq("brand_id", brandId);
  return (data ?? []).map((m) => ({ id: m.profile_id, locale: "ko" as const }));
}

function route(e: NotifyEvent): { to: () => Promise<Recipient[]>; link: (r: Recipient) => string; vars: Record<string, string | number> } {
  switch (e.type) {
    case "request.created":
      return { to: admins, link: () => `/admin/requests/${e.requestId}`, vars: { n: e.itemCount } };
    case "request_item.info_supplied":
      return { to: admins, link: () => `/admin/requests/${e.requestId}`, vars: { seq: e.itemSeq } };
    case "request_item.needs_info":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/requests/${e.requestId}`, vars: { seq: e.itemSeq } };
    case "request_item.assigned":
      return { to: async () => [{ id: e.assigneeId, locale: "zh-CN" }], link: () => `/cn/items/${e.itemId}`, vars: {} };
    case "cn_question.created":
      return { to: admins, link: () => `/admin/requests/${e.requestId}`, vars: {} };
    case "product.review_requested":
      return { to: admins, link: () => `/admin/products/${e.productId}`, vars: {} };
    case "product.rejected":
    case "product.approved":
      return { to: async () => [{ id: e.creatorId, locale: "zh-CN" }], link: () => `/cn/products/${e.productId}`, vars: {} };
    case "offer.issued":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/offers`, vars: {} };
    case "sample.requested":
    case "sample.payment_reported":
    case "sample.cn_shipped":
    case "sample.feedback_done":
    case "offer.expired_with_feedback":
      return { to: admins, link: () => `/admin/samples/${e.sampleId}`, vars: {} };
    case "sample.ready_to_ship":
      return { to: async () => e.cnIds.map((id) => ({ id, locale: "zh-CN" as const })), link: () => `/cn/tasks`, vars: {} };
    case "sample.sent":
    case "sample.charged":
    case "sample.auto_purchased":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/samples/${e.sampleId}`, vars: {} };
    case "sample.purchase_reminder":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/samples/${e.sampleId}#return`, vars: { date: e.date } };
    case "order.reserved":
    case "order.stock_done":
    case "order.deposit_reported":
    case "order.final_approved":
    case "order.qty_confirmed":
    case "order.reported":
    case "order.backorder_choice":
      return { to: admins, link: () => `/admin/orders/${e.orderId}`, vars: {} };
    case "order.stock_check":
    case "order.ship":
      return { to: async () => e.cnIds.map((id) => ({ id, locale: "zh-CN" as const })), link: () => `/cn/tasks`, vars: {} };
    case "order.deposit_requested":
    case "order.quoted":
    case "order.final_quoted":
    case "order.confirmed":
    case "order.sent":
    case "order.backorder":
    case "order.credit":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/orders/${e.orderId}`, vars: {} };
    case "sla.overdue":
      return { to: e.audience === "brand" && e.brandId ? () => brandMembers(e.brandId!) : admins, link: () => e.link, vars: { what: "" } };
    case "offer.expired":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/offers`, vars: {} };
    case "product.fx_recheck":
      return { to: admins, link: () => `/admin/products/${e.productId}`, vars: {} };
    case "sample.feedback_overdue":
    case "sample.return_overdue":
      return { to: admins, link: () => `/admin/samples/${e.sampleId}`, vars: {} };
    case "cn_question.released":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/requests/${e.requestId}`, vars: {} };
    case "offer.all_declined":
      return { to: async () => [{ id: e.assigneeId, locale: "zh-CN" }], link: () => `/cn/items/${e.itemId}`, vars: {} };
    case "cn_question.answered":
      return { to: async () => [{ id: e.askerId, locale: "zh-CN" }], link: () => `/cn/items/${e.itemId}`, vars: {} };
    case "comment.added":
      return {
        to: e.audience === "admin" ? admins : e.audience === "brand" && e.brandId ? () => brandMembers(e.brandId!) : async () => (e.audience === "cn" ? e.cnIds.map((id) => ({ id, locale: "zh-CN" as const })) : []),
        link: () => e.link, vars: {},
      };
    case "brand.applied":
      return { to: admins, link: () => `/admin/brands`, vars: { name: e.brandName } };
    case "brand.slug_requested":
      return { to: admins, link: () => `/admin/brands/${e.brandId}`, vars: { name: e.brandName, slug: e.value } };
    case "brand.slug_changed":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/settings`, vars: { slug: e.brandSlug } };
    case "notify.delivery_failed":
      return { to: admins, link: () => `/admin/notifications`, vars: {} };
  }
}

/** 다이제스트 묶음 키: 이벤트가 가리키는 대상 하나 (제안 여러 건 발행은 같은 요청 → 한 줄) */
export function entityOf(e: NotifyEvent): { entity: string | null; entity_id: string | null } {
  if (e.type === "sla.overdue" || e.type === "comment.added") return { entity: e.entity, entity_id: e.entityId };
  if ("orderId" in e) return { entity: "order", entity_id: e.orderId };
  if ("sampleId" in e) return { entity: "sample_request", entity_id: e.sampleId };
  if ("productId" in e) return { entity: "product", entity_id: e.productId };
  if ("requestId" in e && e.requestId) return { entity: "request", entity_id: e.requestId };
  if ("itemId" in e) return { entity: "request_item", entity_id: e.itemId };
  return { entity: null, entity_id: null };
}

export async function notify(e: NotifyEvent): Promise<void> {
  const r = route(e);
  const recipients = await r.to();
  if (!recipients.length) return;
  const kind = kindOf(e.type);
  const { data } = await createAdminClient()
    .from("notifications")
    .insert(
      recipients.map((p) => ({
        recipient_id: p.id,
        kind,
        type: e.type,
        title: t(p.locale, `notify.${e.type}.title`, e.type === "sla.overdue" ? { what: t(p.locale, `entity.${e.entity}`) + (e.cn ? t(p.locale, "notify.sla.cn") : "") } : r.vars),
        link_path: r.link(p),
        channel: "inapp",
        ...entityOf(e),
      })),
    )
    .select("id");
  // instant는 응답을 보낸 뒤 바로 이메일·WeCom (실패분은 5분 배치가 재시도). 요청 밖(배치)에서 불리면 배치가 처리한다
  const ids = (data ?? []).map((x) => x.id);
  if (kind === "instant" && ids.length) {
    try {
      after(async () => {
        const { deliverInstant } = await import("@/lib/notify-delivery");
        await deliverInstant(ids);
      });
    } catch {
      /* 요청 스코프 밖 — deliver 배치가 보낸다 */
    }
  }
}

/**
 * 초대 메일 (A-07·B-10). 받는 사람은 아직 브랜드 멤버·역할이 없어 notifications 행(수신자 = 프로필)을 만들 수 없다 → 이 모듈에서만 직접 보낸다.
 * 키가 없으면 건너뛰고 호출부가 링크를 화면에 보여 준다.
 */
export async function notifyInvite(args: { email: string; url: string; brandName: string }) {
  const [{ sendEmail }, { createElement }, { NoticeEmail }] = await Promise.all([import("@/lib/channels/email"), import("react"), import("@/emails/notice")]);
  const heading = t("ko", "email.invite.subject", { brand: args.brandName });
  return sendEmail({ to: args.email, subject: heading, react: createElement(NoticeEmail, { locale: "ko", heading, lines: [{ title: t("ko", "email.invite.line"), count: 1, href: args.url }], url: args.url }) });
}
