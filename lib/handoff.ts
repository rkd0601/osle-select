import type { OwnerRole } from "@/lib/sla";

/**
 * 핸드오프 카드 템플릿 14건 (PRD 9장 "핸드오프 카드: 담당자·기한·결정할 것·정보·CTA", 기획서 §11 표).
 * 객체 상태 → 지금 공을 가진 쪽 + 문구 키(handoff.<entity>.<status>.title|decide|cta) + CTA 대상.
 * 브랜드 화면용: 브랜드 차례(BRAND)는 시그니처 색, 나머지는 "기다리는 중" 안내. 문구는 i18n(규칙 10).
 */
export type HandoffEntity = "request" | "sample_request" | "order";
export type HandoffCta = "offers" | "pay" | "feedback" | "return" | "qty" | "receive" | "report" | null;
type Tpl = { owner: Exclude<OwnerRole, null>; cta: HandoffCta };

export const HANDOFFS: Record<`${HandoffEntity}:${string}`, Tpl> = {
  // 요청 (4)
  "request:received": { owner: "ADMIN", cta: null },
  "request:needs_info": { owner: "BRAND", cta: null },
  "request:sourcing": { owner: "CN", cta: null },
  "request:offered": { owner: "BRAND", cta: "offers" },
  // 샘플 (4)
  "sample_request:awaiting_payment": { owner: "BRAND", cta: "pay" },
  "sample_request:cn_shipped": { owner: "ADMIN", cta: null },
  "sample_request:delivered": { owner: "BRAND", cta: "feedback" },
  "sample_request:feedback_done": { owner: "BRAND", cta: "return" },
  // 발주 (6)
  "order:stock_checking": { owner: "CN", cta: null },
  "order:deposit_pending": { owner: "BRAND", cta: "pay" },
  "order:quoted": { owner: "BRAND", cta: "qty" },
  "order:final_quoted": { owner: "ADMIN", cta: null },
  "order:sent_to_brand": { owner: "BRAND", cta: "receive" },
  "order:delivered": { owner: "BRAND", cta: "report" },
};

export function handoffFor(entity: HandoffEntity, status: string) {
  const key = `${entity}:${status}` as const;
  const tpl = HANDOFFS[key];
  if (!tpl) return null;
  const base = `handoff.${entity}.${status}`;
  return { ...tpl, title: `${base}.title`, decide: `${base}.decide`, ctaLabel: tpl.cta ? `${base}.cta` : null };
}
