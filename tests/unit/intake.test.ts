import { describe, it, expect } from "vitest";
import { intakeSlaDate } from "@/lib/sla";

describe("A1 일괄 접수 기한 (희망일 − 5일)", () => {
  const now = new Date("2026-11-05T01:00:00Z"); // KST 11월 5일 10시
  it("희망일 11월 15일 → 11월 10일", () => expect(intakeSlaDate("2026-11-15", now)).toBe("2026-11-10"));
  it("월 경계", () => expect(intakeSlaDate("2026-12-03", now)).toBe("2026-11-28"));
  it("희망일 − 5일이 지났으면 오늘(KST)", () => {
    expect(intakeSlaDate("2026-11-07", now)).toBe("2026-11-05");
    expect(intakeSlaDate("2026-11-07", new Date("2026-11-05T16:00:00Z")), "UTC로는 5일이지만 KST는 6일").toBe("2026-11-06");
  });
  it("희망일이 없으면 오늘 + 5일", () => {
    expect(intakeSlaDate(null, now)).toBe("2026-11-10");
    expect(intakeSlaDate("", now)).toBe("2026-11-10");
  });
});
