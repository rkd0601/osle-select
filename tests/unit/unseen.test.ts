import { describe, expect, it } from "vitest";
import { idsForPath, isUnseen, normPath, unseenPaths } from "@/lib/unseen";

describe("새 소식 표시 (사이트 수정 7·8)", () => {
  it("경로 비교는 쿼리·해시·끝 슬래시를 뗀다", () => {
    expect(normPath("/b/x/samples/1#return")).toBe("/b/x/samples/1");
    expect(normPath("/admin/requests/9?tab=a")).toBe("/admin/requests/9");
    expect(normPath("/cn/items/3/")).toBe("/cn/items/3");
    expect(normPath("/")).toBe("/");
    expect(normPath("https://evil.example/x")).toBeNull();
    expect(normPath(null)).toBeNull();
  });
  it("읽지 않은 알림이 가리키는 화면만 칩 대상", () => {
    const set = unseenPaths([
      { link_path: "/admin/orders/1", read_at: null },
      { link_path: "/admin/orders/2", read_at: "2026-11-09T00:00:00Z" },
      { link_path: null, read_at: null },
    ]);
    expect(isUnseen(set, "/admin/orders/1")).toBe(true);
    expect(isUnseen(set, "/admin/orders/2")).toBe(false);
    expect(isUnseen(set, "/admin/orders/1?x=1")).toBe(true);
  });
  it("화면을 열면 같은 경로의 알림만 읽음", () => {
    const rows = [{ id: "a", link_path: "/b/x/samples/1#return" }, { id: "b", link_path: "/b/x/samples/1" }, { id: "c", link_path: "/b/x/samples/10" }];
    expect(idsForPath(rows, "/b/x/samples/1")).toEqual(["a", "b"]);
    expect(idsForPath(rows, "nope")).toEqual([]);
  });

  it("옛 제안 목록 알림(/b/x/offers)은 진행 화면을 열면 읽음 (11-12 점검)", () => {
    expect(normPath("/b/osle/offers")).toBe("/b/osle/progress");
    expect(normPath("/b/osle/offers/abc")).toBe("/b/osle/offers/abc");
    expect(idsForPath([{ id: "n", link_path: "/b/osle/offers" }], "/b/osle/progress")).toEqual(["n"]);
  });
});
