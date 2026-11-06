/**
 * 요청 영역 순수 로직 (B-02·B-03·A-02·C-01). PRD 4장 request_item.
 * 요청(request) 자체에는 status 컬럼이 없다. 화면은 항목 상태를 aggregateRequestStatus()로 집계해 보여준다.
 */
import { z } from "zod";
import type { REQUEST_ITEM_STATUS } from "./transitions";
import { QTY_RANGES } from "./codes";
import { tk } from "./i18n";

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

/** 요청 이미지 저장 경로: <brand_id>/<yyyymm>/<uuid>.jpg (예전 .webp) — 브랜드 prefix 밖 경로는 서버가 거부한다 */
export const requestImagePath = (brandId: string, id: string, now = new Date()) =>
  `${brandId}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.jpg`;
export const isOwnRequestImagePath = (brandId: string, path: string) =>
  new RegExp(`^${brandId}/\\d{6}/[0-9a-f-]{36}\\.(?:jpg|webp)$`).test(path);

/** 참고 링크: http(s)만 (javascript:·data: 거부) */
export const HttpUrl = z.string().trim().url().max(1000).refine((u) => /^https?:\/\//i.test(u), "http(s) only");

/** B-02 항목 입력 v3(d-28). 필수: 이미지 1장 이상 또는 링크 1개 이상. 한 줄 설명(메모)·카테고리·수량·가격은 선택 */
export const RequestItemInput = z
  .object({
    description: z.string().trim().max(200).default(""),
    category: z.string().trim().max(30).optional().or(z.literal("")),
    targetPriceKrw: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
    expectedQtyRange: z.enum(QTY_RANGES).optional().or(z.literal("")),
    imagePaths: z.array(z.string().max(200)).max(10).default([]),
    links: z.array(HttpUrl).max(5).default([]),
    /** 스타일별 색상·사이즈·소재 메모(v2.3). 항목 컬럼이 없어 요청 메모에 "[스타일 n] …" 줄로 합친다(mergeStyleNotes) */
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .refine((v) => v.imagePaths.length + v.links.length > 0, { message: "request.error.needImageOrLink", path: ["imagePaths"] });
export type RequestItemInput = z.infer<typeof RequestItemInput>;

/**
 * 요청 메모 + 스타일별 메모 → 요청 메모 한 덩어리 (마이그레이션 없이, v2.3). 전체 메모가 먼저, 그 뒤에 스타일 순서대로
 * `[스타일 n] 메모` 한 줄씩. 메모가 빈 스타일은 건너뛴다. 줄바꿈은 공백으로 접는다.
 */
export function mergeStyleNotes(
  memo: string | null | undefined,
  items: { note?: string | null }[],
  line: (n: number, note: string) => string = (n, note) => tk("request.style.noteLine", { n, note }),
): string {
  const lines = items.flatMap((it, i) => {
    const note = (it.note ?? "").replace(/\s+/g, " ").trim();
    return note ? [line(i + 1, note)] : [];
  });
  return [(memo ?? "").trim(), ...lines].filter(Boolean).join("\n");
}

export const RequestInput = z
  .object({
    title: z.string().trim().max(80).optional().or(z.literal("")),
    memo: z.string().trim().max(2000).optional().or(z.literal("")),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    items: z.array(RequestItemInput).min(1).max(20),
  })
  // 저장되는 memo = 전체 메모 + 스타일별 메모(브랜드·관리자 대행 공통 경로)
  .transform((v) => ({ ...v, memo: mergeStyleNotes(v.memo, v.items) }));
export type RequestInput = z.infer<typeof RequestInput>;

/** 요청 작성 화면용 링크 분리·한 줄 검증은 zod 없는 lib/request-links.ts (클라이언트 번들 예산) */
export { splitPastedUrls, styleIssue, type StyleIssue } from "./request-links";
import { linkDomain } from "./request-links";

/** 한국어 받침 여부(은/는 고르기). 마지막 한글·영숫자 글자 기준, 알 수 없으면 false(→ "는") */
export function hasBatchim(word: string): boolean {
  const m = word.replace(/[\s)\]}"'’”.,…·-]+$/u, "").match(/[가-힣A-Za-z0-9]$/u);
  if (!m) return false;
  const c = m[0];
  if (/[가-힣]/.test(c)) return (c.charCodeAt(0) - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(c)) return "013678".includes(c); // 영·일·삼·육·칠·팔
  return /[lmnr]$/i.test(c); // 영문은 대략(L·M·N·R)
}

/** 요청 상세 지금 문장용 짧은 이름: 낱말 단위로 maxLen 안에서 자른다 */
export function shortName(name: string, maxLen = 10): string {
  const words = name.trim().replace(/\s*\(.*?\)\s*/g, " ").split(/\s+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > maxLen && out) break;
    out = next;
  }
  return out.length > maxLen + 4 ? out.slice(0, maxLen) : out;
}

/**
 * 요청 상세(T2): 진행 카드 여러 장(한 항목에 제안·샘플·발주가 겹칠 수 있다) → 항목마다 대표 카드 1장.
 * 진행 중인 카드 우선 → 단계(stage) 높은 순 → 같은 단계면 발주 > 샘플 > 제안 > 요청.
 */
type CardLike = { requestItemId: string; kind: "request" | "offer" | "sample" | "order"; stage: number; done: boolean; stateKey: string };
const KIND_RANK = { order: 3, sample: 2, offer: 1, request: 0 } as const;
export function pickItemCards<C extends CardLike>(cards: C[]): Map<string, C> {
  const out = new Map<string, C>();
  const better = (a: C, b: C) =>
    Number(!a.done) - Number(!b.done) || a.stage - b.stage || KIND_RANK[a.kind] - KIND_RANK[b.kind];
  for (const c of cards) {
    const cur = out.get(c.requestItemId);
    if (!cur || better(c, cur) > 0) out.set(c.requestItemId, c);
  }
  return out;
}

/** 대표 카드 → 짧은 단계 말(i18n `request.detail.phase.<x>`) */
export function itemPhase(c: CardLike): string {
  const s = c.stateKey.split(".").pop() ?? "";
  if (c.kind === "order") return c.done ? "done" : "order";
  if (c.kind === "sample") return c.done ? "sampleDone" : "sample";
  if (c.kind === "offer") {
    if (s === "interested" || s === "hold" || s === "declined" || s === "expired") return s;
    return "offer";
  }
  const req: Record<string, string> = {
    received: "checking", needs_info: "needsInfo", assigned: "sourcing", sourcing: "sourcing", on_hold: "onHold",
    offered: "offer", selected: "interested", closed: "done", cancelled: "cancelled",
  };
  return req[s] ?? "checking";
}

/**
 * 요청 상세 지금 제목 "찾는 중 1 · 확인 중 1 · 샘플 진행 1" (7차 검증 W5): 스타일(항목)마다 가장 진행된 상태 하나(pickItemCards 대표 카드)만 센다 —
 * 한 스타일이 두 단계에 들어가 합이 스타일 수를 넘지 않게. 같은 id가 두 번 와도 한 번. 반환 = 처음 나온 순서대로 [단계 말(itemPhase), 개수].
 */
export function phaseCounts<C extends CardLike>(items: { id: string; status: string }[], cards: C[]): [string, number][] {
  const picked = pickItemCards(cards);
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const phase = itemPhase(picked.get(it.id) ?? { requestItemId: it.id, kind: "request", stage: 1, done: false, stateKey: `state.request.${it.status}` });
    out.set(phase, (out.get(phase) ?? 0) + 1);
  }
  return [...out];
}

/**
 * 요청 메모 → 전체 메모 + 스타일별 메모 (A5): mergeStyleNotes가 합친 "[스타일 n] …" 줄을 다시 떼어 항목 줄 아래로 보낸다.
 * 줄 모양은 i18n `request.style.noteLine`("[스타일 {n}] {note}")과 같다.
 */
export function splitStyleNotes(memo: string | null | undefined): { memo: string; notes: Map<number, string> } {
  const notes = new Map<number, string>();
  const rest: string[] = [];
  for (const line of (memo ?? "").split(/\r?\n/)) {
    const m = line.match(/^\[(?:스타일|항목) (\d+)\]\s*(.+)$/);
    if (m) notes.set(Number(m[1]), m[2].trim());
    else rest.push(line);
  }
  return { memo: rest.join("\n").trim(), notes };
}

/** 제목이 비면 첫 항목 설명 → 첫 링크 도메인 → "사진 n장" (v3: 설명은 선택) */
export const requestTitle = (input: Pick<RequestInput, "title" | "items">) => {
  const first = input.items[0];
  return (
    input.title?.trim() ||
    first.description.slice(0, 80) ||
    first.links.map(linkDomain).find(Boolean) ||
    tk("request.style.photoCount", { n: first.imagePaths.length || 1 })
  );
};

/**
 * 관리자 번역 초안 재료 (A3): 메모(설명) → 링크 og:title → 도메인. 아무것도 없으면 null(사진만 — 사람이 적는다).
 */
export function draftSource(description: string | null | undefined, links: { source_url: string | null; link_title?: string | null }[]): string | null {
  const d = (description ?? "").trim();
  if (d) return d;
  const title = links.map((l) => (l.link_title ?? "").trim()).find(Boolean);
  if (title) return title;
  return links.map((l) => linkDomain(l.source_url)).find(Boolean) ?? null;
}

/** CN 마감일(date, 중국 기준 하루 끝) → due_at */
export const slaDateToDue = (d: string) => new Date(`${d}T23:59:59+08:00`);
