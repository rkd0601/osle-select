/**
 * 관리자 목록 정렬 (§0-l P1·P2, d-29) — 순수 함수.
 * 할 일 기본 = 최근 활동 내림차순 + 지연 맨 위 고정, `?sort=due`면 예전처럼 기한순.
 * 요청 접수 목록 기본 = 업데이트(최근 활동) 내림차순, `?sort=due`면 기한순.
 * "새" = 생긴 지 24시간 안.
 */
export type SortMode = "recent" | "due";
export const NEW_HOURS = 24;

/** 검색 파라미터 → 정렬 (모르는 값 = 최근) */
export const sortMode = (v: string | undefined | null): SortMode => (v === "due" ? "due" : "recent");

/** 여러 시각 중 가장 늦은 것 (ISO 문자열 비교, 빈 값 무시) */
export function latestAt(...vals: (string | null | undefined)[]): string | null {
  let out: string | null = null;
  for (const v of vals) if (v && (!out || new Date(v).getTime() > new Date(out).getTime())) out = v;
  return out;
}

export const isNew = (createdAt: string | null | undefined, now = new Date(), hours = NEW_HOURS) =>
  !!createdAt && now.getTime() - new Date(createdAt).getTime() < hours * 3600_000 && new Date(createdAt).getTime() <= now.getTime() + 60_000;

const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);
/** 기한 오름차순(없으면 뒤) */
const byDue = (a: { due_at: string | null }, b: { due_at: string | null }) => {
  const x = time(a.due_at), y = time(b.due_at);
  if (Number.isNaN(x) && Number.isNaN(y)) return 0;
  if (Number.isNaN(x)) return 1;
  if (Number.isNaN(y)) return -1;
  return x - y;
};
/** 최근 활동 내림차순(없으면 뒤) */
const byActivity = (a: { activity_at: string | null }, b: { activity_at: string | null }) => {
  const x = time(a.activity_at), y = time(b.activity_at);
  if (Number.isNaN(x) && Number.isNaN(y)) return 0;
  if (Number.isNaN(x)) return 1;
  if (Number.isNaN(y)) return -1;
  return y - x;
};

type Row = { due_at: string | null; activity_at: string | null };

/**
 * 할 일 정렬 (P1): recent = 지연 행(기한 오름차순) 먼저, 나머지는 최근 활동 내림차순 / due = 기한 오름차순.
 * 원본 배열은 건드리지 않는다.
 */
export function sortTodo<T extends Row>(rows: T[], mode: SortMode, now = new Date()): T[] {
  if (mode === "due") return [...rows].sort(byDue);
  const late = (r: T) => !!r.due_at && time(r.due_at) < now.getTime();
  return [...rows.filter(late).sort(byDue), ...rows.filter((r) => !late(r)).sort(byActivity)];
}

/** 접수 목록 정렬 (P2): recent = 업데이트 내림차순 / due = 기한 오름차순 */
export function sortByUpdate<T extends Row>(rows: T[], mode: SortMode): T[] {
  return [...rows].sort(mode === "due" ? byDue : byActivity);
}
