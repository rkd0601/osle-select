/**
 * 알림 라우팅 규칙 (순수 — 테스트 가능). 이벤트 → 수신 대상·kind. 수신자 조회·행 생성은 lib/notify.ts, 발송은 lib/notify-delivery.ts.
 * EVENT_AUDIENCE는 NotifyEvent의 모든 type을 키로 가져야 컴파일된다(전수).
 */
import type { Locale } from "@/lib/i18n";

export type NotifyEvent =
  | { type: "request.created"; brandId: string; requestId: string; itemCount: number }
  | { type: "request_item.needs_info"; brandId: string; brandSlug: string; requestId: string; itemSeq: number }
  | { type: "request_item.info_supplied"; brandId: string; requestId: string; itemSeq: number }
  | { type: "request_item.assigned"; assigneeId: string; itemId: string }
  | { type: "cn_question.created"; requestId: string; itemId: string }
  | { type: "product.review_requested"; productId: string }
  | { type: "product.rejected"; productId: string; creatorId: string }
  | { type: "product.approved"; productId: string; creatorId: string }
  | { type: "offer.issued"; brandId: string; brandSlug: string; requestId: string | null }
  | { type: "offer.all_declined"; assigneeId: string; itemId: string }
  | { type: "sample.requested"; sampleId: string; paymentRequired: boolean }
  | { type: "sample.payment_reported"; sampleId: string }
  | { type: "sample.ready_to_ship"; sampleId: string; cnIds: string[] }
  | { type: "sample.cn_shipped"; sampleId: string }
  | { type: "sample.sent"; brandId: string; brandSlug: string; sampleId: string }
  | { type: "sample.charged"; brandId: string; brandSlug: string; sampleId: string }
  | { type: "sample.feedback_done"; sampleId: string }
  | { type: "offer.expired_with_feedback"; sampleId: string }
  | { type: "sla.overdue"; entity: string; entityId: string; audience: "admin" | "brand"; brandId: string | null; link: string; cn: boolean }
  | { type: "offer.expired"; brandId: string; brandSlug: string; requestId: string | null }
  | { type: "product.fx_recheck"; productId: string }
  | { type: "sample.feedback_overdue" | "sample.return_overdue"; sampleId: string }
  | { type: "cn_question.released"; brandId: string; brandSlug: string; requestId: string }
  | { type: "order.reserved" | "order.stock_done" | "order.deposit_reported" | "order.final_approved" | "order.qty_confirmed" | "order.reported" | "order.backorder_choice"; orderId: string }
  | { type: "order.stock_check" | "order.ship"; orderId: string; cnIds: string[] }
  | { type: "order.deposit_requested" | "order.quoted" | "order.final_quoted" | "order.confirmed" | "order.sent" | "order.backorder" | "order.credit"; orderId: string; brandId: string; brandSlug: string }
  | { type: "notify.delivery_failed"; notificationId: string }
  | { type: "cn_question.answered"; askerId: string; itemId: string }
  | { type: "brand.applied"; applicationId: string; brandName: string }
  | { type: "brand.slug_requested"; brandId: string; brandName: string; value: string }
  | { type: "brand.slug_changed"; brandId: string; brandSlug: string }
  | { type: "comment.added"; audience: "admin" | "brand" | "cn"; brandId: string | null; cnIds: string[]; link: string; entity: string; entityId: string };

export type NotifyType = NotifyEvent["type"];
export type Audience = "admin" | "brand" | "cn" | "admin_or_brand" | "by_event";

export const EVENT_AUDIENCE = {
  "request.created": "admin", "request_item.info_supplied": "admin", "request_item.needs_info": "brand", "request_item.assigned": "cn",
  "cn_question.created": "admin", "cn_question.released": "brand", "cn_question.answered": "cn",
  "product.review_requested": "admin", "product.rejected": "cn", "product.approved": "cn", "product.fx_recheck": "admin",
  "offer.issued": "brand", "offer.all_declined": "cn", "offer.expired": "brand", "offer.expired_with_feedback": "admin",
  "sample.requested": "admin", "sample.payment_reported": "admin", "sample.ready_to_ship": "cn", "sample.cn_shipped": "admin",
  "sample.sent": "brand", "sample.charged": "brand", "sample.feedback_done": "admin", "sample.feedback_overdue": "admin", "sample.return_overdue": "admin",
  "sla.overdue": "admin_or_brand",
  "order.reserved": "admin", "order.stock_done": "admin", "order.deposit_reported": "admin", "order.final_approved": "admin", "order.qty_confirmed": "admin", "order.reported": "admin", "order.backorder_choice": "admin",
  "order.stock_check": "cn", "order.ship": "cn",
  "order.deposit_requested": "brand", "order.quoted": "brand", "order.final_quoted": "brand", "order.confirmed": "brand", "order.sent": "brand", "order.backorder": "brand", "order.credit": "brand",
  "notify.delivery_failed": "admin",
  "comment.added": "by_event",
  "brand.applied": "admin", // 쓴 사람의 상대 (lib/comments#commentAudience)
  "brand.slug_requested": "admin", "brand.slug_changed": "brand",
} as const satisfies Record<NotifyType, Audience>;

/** 즉시(공이 넘어옴) / 그 외 다이제스트. 제안 발행은 항목 단위 다이제스트 — 7개 발행해도 1통(PRD 12장), 묶음 발송은 8단계 */
export const INSTANT = new Set<NotifyType>([
  "request_item.needs_info", "request_item.assigned", "cn_question.created", "request_item.info_supplied",
  "product.review_requested", "product.rejected", "offer.all_declined",
  "sample.requested", "sample.payment_reported", "sample.ready_to_ship", "sample.charged",
  "order.reserved", "order.stock_check", "order.deposit_requested", "order.deposit_reported", "order.final_approved", "order.quoted", "order.qty_confirmed",
  "order.final_quoted", "order.ship", "order.backorder", "order.reported",
  "sla.overdue", "product.fx_recheck", "sample.feedback_overdue", "sample.return_overdue", "cn_question.released", "order.backorder_choice",
  "cn_question.answered", "comment.added", "brand.applied", // 대화는 상대가 바로 알아야 한다
  "brand.slug_requested", "brand.slug_changed", // 주소 변경은 기존 링크가 깨진다 (DECISIONS 9-8)
  "order.stock_done", "order.sent", // D17: 공이 넘어오는 순간은 즉시 (DECISIONS r5-8)
]);

export const kindOf = (t: NotifyType): "instant" | "digest" => (INSTANT.has(t) ? "instant" : "digest");

/** digest 시각 (DECISIONS r6-5): 브랜드·ADMIN 09:00 KST(00 UTC 실행), CN zh-CN 09:00 CST(01 UTC 실행). 수동 실행(다른 시각)은 ko만 */
export const digestDue = (locale: Locale, utcHour: number) => (locale === "zh-CN" ? utcHour === 1 : utcHour !== 1);

/**
 * 코멘트 알림 묶기 (DECISIONS 8-9 → r8-8): 같은 수신자·같은 대상에서 **마지막으로 실제 외부 발송된(또는 보낼 차례인) 행**이
 * 10분 안에 있으면 이 행은 외부 발송 없이 닫는다. 묶인 행(bundled)은 기준에서 뺀다 — 직전 행 기준이면 8분 간격 연속 코멘트가
 * 끝없이 묶여 외부 발송이 0이 된다.
 */
export const BUNDLE_MS = 10 * 60_000;
export type BundlePrior = { created_at: string; sent: boolean; bundled: boolean; pending: boolean };
export function shouldBundle(createdAt: string, priors: BundlePrior[]): boolean {
  const at = new Date(createdAt).getTime();
  return priors.some((p) => {
    const t = new Date(p.created_at).getTime();
    return !p.bundled && (p.sent || p.pending) && t <= at && at - t <= BUNDLE_MS;
  });
}

/**
 * WeCom 발송 대상 (DECISIONS r6-4). 원청 외부 계정(CN_VENDOR)은 자기 원청 웹훅으로만 — 없으면 보내지 않는다(인앱만).
 * 내부 소싱 그룹 봇으로 대신 보내지 않는다: 원청에는 닿지 않고, 그룹 봇이 원청 그룹이 되는 순간 다른 원청 알림이 섞인다.
 * 그 외 CN(소싱 담당)은 그룹 봇(WECOM_WEBHOOK_URL).
 */
export function wecomUrlFor(role: string, vendorWebhook: string | null | undefined, groupUrl: string | null | undefined): string | null {
  if (role === "CN_VENDOR") return vendorWebhook || null;
  return groupUrl || null;
}
