import { z } from "zod";

/**
 * 통합 코멘트 규칙 (순수). 가시성 3종:
 * - brand: 브랜드 ↔ 위아더 (한국어만 — 브랜드에게 중국어 원문을 보이지 않는다, 규칙 1)
 * - internal: 위아더 내부 메모 (ADMIN만)
 * - cn: 위아더 ↔ 중국 담당 (ko↔zh 자동 번역, 원문/번역 병기). 브랜드는 절대 못 본다
 * 쓰기는 서버 액션만(lib/actions/comments). 행위자 종류가 가시성을 정한다 — 브랜드는 brand, CN은 cn만.
 */
export const COMMENT_TARGETS = ["request", "request_item", "offer", "sample_request", "order", "order_line"] as const;
export type CommentTarget = (typeof COMMENT_TARGETS)[number];
export type Visibility = "brand" | "internal" | "cn";
export type AuthorKind = "brand" | "admin" | "cn";

/** CN이 코멘트를 달 수 있는 대상 — RLS comments_cn(본인 배정 항목·본인 상품의 제안)과 같게 */
export const CN_TARGETS: readonly CommentTarget[] = ["request_item", "offer"];
/** 브랜드 대상 — 브랜드 소유 객체 */
export const BRAND_TARGETS: readonly CommentTarget[] = ["request", "request_item", "offer", "sample_request", "order", "order_line"];

export const CommentInput = z.object({
  targetType: z.enum(COMMENT_TARGETS),
  targetId: z.guid(),
  visibility: z.enum(["brand", "internal", "cn"]).optional(),
  body: z.string().trim().min(1).max(2000),
});

/** 행위자가 쓸 수 있는 가시성. 요청한 가시성이 허용되지 않으면 null(거부) */
export function resolveVisibility(author: AuthorKind, target: CommentTarget, requested?: Visibility): Visibility | null {
  if (author === "brand") return (requested ?? "brand") === "brand" && BRAND_TARGETS.includes(target) ? "brand" : null;
  if (author === "cn") return (requested ?? "cn") === "cn" && CN_TARGETS.includes(target) ? "cn" : null;
  const v = requested ?? "internal";
  if (v === "cn" && !CN_TARGETS.includes(target)) return null;
  return v;
}

/** 번역 방향: cn 가시성만 번역. CN이 쓰면 zh→ko, 위아더가 쓰면 ko→zh. 나머지는 한국어 그대로 */
export function translationOf(author: AuthorKind, v: Visibility): { source: "ko" | "zh-CN"; translateTo: "ko" | "zh-CN" | null } {
  if (v !== "cn") return { source: "ko", translateTo: null };
  return author === "cn" ? { source: "zh-CN", translateTo: "ko" } : { source: "ko", translateTo: "zh-CN" };
}

/** 누구에게 알릴지: 브랜드·CN이 쓰면 위아더, 위아더가 쓰면 그 가시성의 상대, 내부 메모는 아무도 */
export function commentAudience(author: AuthorKind, v: Visibility): "admin" | "brand" | "cn" | null {
  if (author !== "admin") return "admin";
  return v === "brand" ? "brand" : v === "cn" ? "cn" : null;
}
