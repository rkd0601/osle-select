import { describe, expect, it } from "vitest";
import { finalApprovalState } from "@/lib/orders";
import { ownerAndDue } from "@/lib/sla";
import { handoffFor } from "@/lib/handoff";
import { ADMIN_DICTS } from "@/lib/i18n/admin";
import { EVENT_AUDIENCE, kindOf } from "@/lib/notify-rules";

/** 최종 견적 브랜드 동의 (DECISIONS u-10): 확정은 "지금 최종 견적 이후 + 같은 총액"의 동의가 있을 때만 */
describe("finalApprovalState", () => {
  const quotedAt = "2026-11-04T05:00:00Z";
  it("동의 없으면 missing", () => expect(finalApprovalState(null, quotedAt, 747_750)).toBe("missing"));
  it("최종 견적을 다시 내기 전에 한 동의는 stale", () =>
    expect(finalApprovalState({ at: "2026-11-04T04:59:59Z", total_krw: 747_750, onBehalf: false }, quotedAt, 747_750)).toBe("stale"));
  it("동의한 총액과 지금 계산이 다르면 changed", () =>
    expect(finalApprovalState({ at: "2026-11-04T06:00:00Z", total_krw: 747_750, onBehalf: false }, quotedAt, 746_550)).toBe("changed"));
  it("이후 동의 + 같은 총액이면 ok (대행이어도)", () => {
    expect(finalApprovalState({ at: "2026-11-04T06:00:00Z", total_krw: 747_750, onBehalf: false }, quotedAt, 747_750)).toBe("ok");
    expect(finalApprovalState({ at: quotedAt, total_krw: 1, onBehalf: true }, quotedAt, 1)).toBe("ok");
  });
});

describe("final_quoted = 브랜드 차례", () => {
  const ko = ADMIN_DICTS.ko as Record<string, string>;
  it("SLA: 브랜드 3일", () => {
    const now = new Date("2026-11-04T00:00:00Z");
    const r = ownerAndDue("order", "final_quoted", now);
    expect(r.owner_role).toBe("BRAND");
    expect(r.due_at?.toISOString().slice(0, 10)).toBe("2026-11-07");
  });
  it("핸드오프: 동의 전 브랜드(금액 확인 CTA), 동의 뒤 위아더", () => {
    const before = handoffFor("order", "final_quoted")!;
    expect(before.owner).toBe("BRAND");
    expect(before.cta).toBe("approve");
    expect(ko[before.ctaLabel!]).toBeTruthy();
    const after = handoffFor("order", "final_quoted", { finalApproved: true })!;
    expect(after.owner).toBe("ADMIN");
    expect(ko[after.title] && ko[after.decide]).toBeTruthy();
  });
  it("동의 알림은 관리자에게 즉시", () => {
    expect(EVENT_AUDIENCE["order.final_approved"]).toBe("admin");
    expect(kindOf("order.final_approved")).toBe("instant");
  });
});
