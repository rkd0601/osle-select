import { describe, it, expect } from "vitest";
import { cnGateOpen, fxDrifted, offerExpired, slaOverdue } from "@/lib/cron-rules";

describe("배치 판정", () => {
  it("환율 ±3%: 경계 포함, 발행 환율 없으면 대상 아님", () => {
    expect(fxDrifted(200, 206, 0.03)).toBe(true);
    expect(fxDrifted(200, 194, 0.03)).toBe(true);
    expect(fxDrifted(200, 205.9, 0.03)).toBe(false);
    expect(fxDrifted(null, 250, 0.03)).toBe(false);
  });
  it("제안 만료: 반응 가능 상태 + 유효기간이 오늘 전", () => {
    expect(offerExpired({ status: "interested", valid_until: "2026-10-31" }, "2026-11-01")).toBe(true);
    expect(offerExpired({ status: "interested", valid_until: "2026-11-01" }, "2026-11-01")).toBe(false);
    expect(offerExpired({ status: "declined", valid_until: "2026-10-01" }, "2026-11-01")).toBe(false);
    expect(offerExpired({ status: "recheck", valid_until: "2026-10-01" }, "2026-11-01")).toBe(false);
  });
  it("SLA: 담당·기한이 있고 지났을 때만", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(slaOverdue({ owner_role: "ADMIN", due_at: "2026-11-01T09:00:00Z" }, now)).toBe(true);
    expect(slaOverdue({ owner_role: null, due_at: "2026-11-01T09:00:00Z" }, now)).toBe(false);
    expect(slaOverdue({ owner_role: "BRAND", due_at: "2026-11-01T11:00:00Z" }, now)).toBe(false);
  });
  it("CN 질문 게이트: 4시간 경과·보류 아님·미노출", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(cnGateOpen({ released_at: null, held_by_admin: false, admin_gate_until: "2026-11-01T10:00:00Z" }, now)).toBe(true);
    expect(cnGateOpen({ released_at: null, held_by_admin: true, admin_gate_until: "2026-11-01T06:00:00Z" }, now)).toBe(false);
    expect(cnGateOpen({ released_at: "2026-11-01T07:00:00Z", held_by_admin: false, admin_gate_until: "2026-11-01T06:00:00Z" }, now)).toBe(false);
  });
});
