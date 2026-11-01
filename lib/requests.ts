/**
 * 요청 영역 순수 로직 (B-02·B-03·A-02·C-01). PRD 4장 request_item.
 * 요청(request) 자체에는 status 컬럼이 없다. 화면은 항목 상태를 aggregateRequestStatus()로 집계해 보여준다.
 */
import { z } from "zod";
import type { REQUEST_ITEM_STATUS } from "./transitions";
import { QTY_RANGES } from "./codes";

export type RequestItemStatus = (typeof REQUEST_ITEM_STATUS)[number];
export type RequestStatus = "received" | "needs_info" | "sourcing" | "offered" | "on_hold" | "closed" | "cancelled";

/**
 * 요청 집계 상태. 우선순위: 브랜드 차례(needs_info) → 제안 도착(offered/selected) → 찾는 중 → 접수 → 보류 → 종료.
 * 진행 중 항목이 하나라도 있으면 종료로 보지 않는다.
 */
export function aggregateRequestStatus(items: { status: RequestItemStatus }[]): RequestStatus {
  const s = new Set(items.map((i) => i.status));
  if (!items.length || [...s].every((x) => x === "cancelled")) return "cancelled";
  if (s.has("needs_info")) return "needs_info";
  if (s.has("offered") || s.has("selected")) return "offered";
  if (s.has("assigned") || s.has("sourcing")) return "sourcing";
  if (s.has("received")) return "received";
  if (s.has("on_hold")) return "on_hold";
  return "closed";
}

/**
 * 제안 반응이 바뀐 뒤 요청 항목이 가야 할 상태 (PRD 12장: 모두 거절 시 sourcing 복귀 + CN 알림).
 * 5단계(B-04 반응)에서 호출한다. null이면 그대로 둔다.
 */
export function itemStatusAfterReactions(
  current: RequestItemStatus,
  offers: { status: string }[],
): RequestItemStatus | null {
  const live = offers.filter((o) => o.status !== "expired");
  if (!live.length) return null;
  // 모두 거절로 sourcing에 돌아간 뒤 브랜드가 다시 관심을 누르면 제안 단계로 복귀 (5단계 리뷰 5)
  if (current === "sourcing") return live.some((o) => o.status === "interested") ? "offered" : null;
  if (current !== "offered" && current !== "selected") return null;
  if (live.every((o) => o.status === "declined")) return "sourcing";
  if (current === "offered" && live.some((o) => o.status === "interested")) return "selected";
  return null;
}

/** 항목 정리(분리·병합·수정)는 CN에 넘기기 전 상태에서만 */
export const isEditableByAdmin = (s: RequestItemStatus) => s === "received" || s === "needs_info" || s === "on_hold";
/** 브랜드가 내용을 고칠 수 있는 상태 */
export const isEditableByBrand = (s: RequestItemStatus) => s === "received" || s === "needs_info";

/** 보완 요청 사유 템플릿 코드 (i18n 키: needsInfo.reason.<code>) */
export const NEEDS_INFO_REASONS = ["photo", "link", "qty", "price", "detail", "other"] as const;
export type NeedsInfoReason = (typeof NEEDS_INFO_REASONS)[number];

/** 요청 이미지 저장 경로: <brand_id>/<yyyymm>/<uuid>.webp — 브랜드 prefix 밖 경로는 서버가 거부한다 */
export const requestImagePath = (brandId: string, id: string, now = new Date()) =>
  `${brandId}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.webp`;
export const isOwnRequestImagePath = (brandId: string, path: string) =>
  new RegExp(`^${brandId}/\\d{6}/[0-9a-f-]{36}\\.webp$`).test(path);

/** 참고 링크: http(s)만 (javascript:·data: 거부) */
export const HttpUrl = z.string().trim().url().max(1000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");

/** B-02 항목 입력. 필수: 한 줄 설명 + (이미지 1장 이상 또는 링크 1개 이상) */
export const RequestItemInput = z
  .object({
    description: z.string().trim().min(1).max(200),
    category: z.string().trim().max(30).optional().or(z.literal("")),
    targetPriceKrw: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
    expectedQtyRange: z.enum(QTY_RANGES).optional().or(z.literal("")),
    imagePaths: z.array(z.string().max(200)).max(10).default([]),
    links: z.array(HttpUrl).max(5).default([]),
  })
  .refine((v) => v.imagePaths.length + v.links.length > 0, { message: "request.error.needImageOrLink", path: ["imagePaths"] });
export type RequestItemInput = z.infer<typeof RequestItemInput>;

export const RequestInput = z.object({
  title: z.string().trim().max(80).optional().or(z.literal("")),
  memo: z.string().trim().max(2000).optional().or(z.literal("")),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  items: z.array(RequestItemInput).min(1).max(20),
});
export type RequestInput = z.infer<typeof RequestInput>;

/** 제목이 비면 첫 항목 설명으로 */
export const requestTitle = (input: Pick<RequestInput, "title" | "items">) =>
  input.title?.trim() || input.items[0].description.slice(0, 80);

/** CN 마감일(date, 중국 기준 하루 끝) → due_at */
export const slaDateToDue = (d: string) => new Date(`${d}T23:59:59+08:00`);
