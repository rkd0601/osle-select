import { describe, expect, it } from "vitest";
import { commentSummaryRows } from "@/lib/timeline-rows";

/** 진행 기록 메시지 접기 (DECISIONS u-11): 본문 없이 KST 날짜별 "메시지 n건" */
describe("commentSummaryRows", () => {
  const label = (n: number) => `메시지 ${n}건`;
  it("같은 KST 날짜는 한 줄, 시각은 그날 마지막 메시지", () => {
    const rows = commentSummaryRows(
      [{ created_at: "2026-11-04T01:00:00Z" }, { created_at: "2026-11-04T09:00:00Z" }, { created_at: "2026-11-04T03:00:00Z" }],
      label,
    );
    expect(rows).toEqual([{ at: "2026-11-04T09:00:00Z", label: "메시지 3건" }]);
  });
  it("UTC 15시 이후는 다음 날(KST)로 나뉜다", () => {
    const rows = commentSummaryRows([{ created_at: "2026-11-04T14:59:00Z" }, { created_at: "2026-11-04T15:01:00Z" }], label);
    expect(rows.map((r) => r.label)).toEqual(["메시지 1건", "메시지 1건"]);
  });
  it("본문(sub)을 싣지 않는다", () => {
    expect(commentSummaryRows([{ created_at: "2026-11-04T01:00:00Z" }], label)[0]).not.toHaveProperty("sub");
  });
  it("메시지 없으면 행 없음", () => expect(commentSummaryRows([], label)).toEqual([]));
});
