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
  | { type: "order.reserved" | "order.stock_done" | "order.deposit_reported" | "order.qty_confirmed" | "order.reported" | "order.backorder_choice"; orderId: string }
  | { type: "order.stock_check" | "order.ship"; orderId: string; cnIds: string[] }
  | { type: "order.deposit_requested" | "order.quoted" | "order.final_quoted" | "order.confirmed" | "order.sent" | "order.backorder" | "order.credit"; orderId: string; brandId: string; brandSlug: string }
  | { type: "notify.delivery_failed"; notificationId: string };

export type NotifyType = NotifyEvent["type"];
export type Audience = "admin" | "brand" | "cn" | "admin_or_brand";

export const EVENT_AUDIENCE = {
  "request.created": "admin", "request_item.info_supplied": "admin", "request_item.needs_info": "brand", "request_item.assigned": "cn",
  "cn_question.created": "admin", "cn_question.released": "brand",
  "product.review_requested": "admin", "product.rejected": "cn", "product.approved": "cn", "product.fx_recheck": "admin",
  "offer.issued": "brand", "offer.all_declined": "cn", "offer.expired": "brand", "offer.expired_with_feedback": "admin",
  "sample.requested": "admin", "sample.payment_reported": "admin", "sample.ready_to_ship": "cn", "sample.cn_shipped": "admin",
  "sample.sent": "brand", "sample.charged": "brand", "sample.feedback_done": "admin", "sample.feedback_overdue": "admin", "sample.return_overdue": "admin",
  "sla.overdue": "admin_or_brand",
  "order.reserved": "admin", "order.stock_done": "admin", "order.deposit_reported": "admin", "order.qty_confirmed": "admin", "order.reported": "admin", "order.backorder_choice": "admin",
  "order.stock_check": "cn", "order.ship": "cn",
  "order.deposit_requested": "brand", "order.quoted": "brand", "order.final_quoted": "brand", "order.confirmed": "brand", "order.sent": "brand", "order.backorder": "brand", "order.credit": "brand",
  "notify.delivery_failed": "admin",
} as const satisfies Record<NotifyType, Audience>;

/** 즉시(공이 넘어옴) / 그 외 다이제스트. 제안 발행은 항목 단위 다이제스트 — 7개 발행해도 1통(PRD 12장), 묶음 발송은 8단계 */
export const INSTANT = new Set<NotifyType>([
  "request_item.needs_info", "request_item.assigned", "cn_question.created", "request_item.info_supplied",
  "product.review_requested", "product.rejected", "offer.all_declined",
  "sample.requested", "sample.payment_reported", "sample.ready_to_ship", "sample.charged",
  "order.reserved", "order.stock_check", "order.deposit_requested", "order.deposit_reported", "order.quoted", "order.qty_confirmed",
  "order.final_quoted", "order.ship", "order.backorder", "order.reported",
  "sla.overdue", "product.fx_recheck", "sample.feedback_overdue", "sample.return_overdue", "cn_question.released", "order.backorder_choice",
  "order.stock_done", "order.sent", // D17: 공이 넘어오는 순간은 즉시 (DECISIONS r5-8)
]);

export const kindOf = (t: NotifyType): "instant" | "digest" => (INSTANT.has(t) ? "instant" : "digest");

/** digest 시각 (DECISIONS r6-5): 브랜드·ADMIN 09:00 KST(00 UTC 실행), CN zh-CN 09:00 CST(01 UTC 실행). 수동 실행(다른 시각)은 ko만 */
export const digestDue = (locale: Locale, utcHour: number) => (locale === "zh-CN" ? utcHour === 1 : utcHour !== 1);
