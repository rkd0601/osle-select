import { describe, it, expect } from "vitest";
import { isNew, latestAt, sortByUpdate, sortMode, sortTodo } from "@/lib/admin-recency";

const now = new Date("2026-11-06T00:29:00Z"); // KST 09:29

describe("관리자 정렬 (§0-l P1·P2)", () => {
  it("sortMode: due만 기한순, 나머지는 최근", () => {
    expect(sortMode("due")).toBe("due");
    expect(sortMode(undefined)).toBe("recent");
    expect(sortMode("x")).toBe("recent");
  });

  it("latestAt: 가장 늦은 시각, 빈 값 무시", () => {
    expect(latestAt(null, "2026-11-05T00:00:00Z", undefined, "2026-11-06T00:00:00Z", "2026-11-04T00:00:00Z")).toBe("2026-11-06T00:00:00Z");
    expect(latestAt(null, undefined)).toBeNull();
  });

  it("isNew: 24시간 안만", () => {
    expect(isNew("2026-11-05T01:00:00Z", now)).toBe(true);
    expect(isNew("2026-11-05T00:00:00Z", now)).toBe(false);
    expect(isNew(null, now)).toBe(false);
  });

  const rows = [
    { id: "old-late", due_at: "2026-11-01T00:00:00Z", activity_at: "2026-10-01T00:00:00Z" },
    { id: "fresh", due_at: "2026-11-20T00:00:00Z", activity_at: "2026-11-06T00:20:00Z" },
    { id: "late2", due_at: "2026-11-05T00:00:00Z", activity_at: "2026-11-06T00:10:00Z" },
    { id: "mid", due_at: "2026-11-08T00:00:00Z", activity_at: "2026-11-03T00:00:00Z" },
    { id: "nodue", due_at: null, activity_at: "2026-11-04T00:00:00Z" },
  ];

  it("할 일 최근순: 지연 맨 위(기한순) → 나머지 최근 활동 내림차순", () => {
    expect(sortTodo(rows, "recent", now).map((r) => r.id)).toEqual(["old-late", "late2", "fresh", "nodue", "mid"]);
  });
  it("할 일 기한순: 기한 오름차순, 기한 없음은 뒤", () => {
    expect(sortTodo(rows, "due", now).map((r) => r.id)).toEqual(["old-late", "late2", "mid", "fresh", "nodue"]);
  });
  it("접수 목록: 업데이트 내림차순 / 기한순, 원본 불변", () => {
    const copy = rows.map((r) => r.id);
    expect(sortByUpdate(rows, "recent").map((r) => r.id)).toEqual(["fresh", "late2", "nodue", "mid", "old-late"]);
    expect(sortByUpdate(rows, "due").map((r) => r.id)).toEqual(["old-late", "late2", "mid", "fresh", "nodue"]);
    expect(rows.map((r) => r.id)).toEqual(copy);
  });
});
