import { describe, expect, it } from "vitest";
import { allowedNext } from "@/lib/transitions";
import { logisticsSettlement, totalWithSettlement } from "@/lib/orders";
import { orderAutoReportDue } from "@/lib/cron-rules";

/** 업무 단순화 v1 (PRD 2026-11-10) */
describe("O2 견적 1회", () => {
  it("관리자는 quoting에서 바로 final_quoted로 (quoted는 호환으로 남음)", () => {
    expect(allowedNext("order", "quoting", "ADMIN")).toEqual(expect.arrayContaining(["final_quoted", "quoted"]));
    expect(allowedNext("order", "quoting", "BRAND_OWNER")).not.toContain("final_quoted");
  });
  it("실제 물류비가 예상보다 10% 넘게 많을 때만 재동의", () => {
    expect(logisticsSettlement(100_000, 110_000, "t").status).toBe("applied");
    expect(logisticsSettlement(100_000, 110_010, "t").status).toBe("pending_consent");
    expect(logisticsSettlement(100_000, 80_000, "t")).toMatchObject({ status: "applied", diff_krw: -20_000 });
  });
  it("총액은 반영된 정산만 더한다", () => {
    expect(totalWithSettlement({ total_krw: 500_000, logistics_settlement: logisticsSettlement(100_000, 105_000, "t") })).toBe(505_000);
    expect(totalWithSettlement({ total_krw: 500_000, logistics_settlement: logisticsSettlement(100_000, 150_000, "t") })).toBe(500_000);
    expect(totalWithSettlement({ total_krw: 500_000 })).toBe(500_000);
  });
});

describe("O4 도착 보고 자동 완료", () => {
  const now = new Date("2026-11-20T03:00:00Z");
  it("발송 7일 뒤 무응답이면 대상", () => {
    expect(orderAutoReportDue({ status: "sent_to_brand", sent_at: "2026-11-13T02:00:00Z", report_due: null }, now, 7)).toBe(true);
    expect(orderAutoReportDue({ status: "sent_to_brand", sent_at: "2026-11-14T02:00:00Z", report_due: null }, now, 7)).toBe(false);
  });
  it("받은 뒤에는 보고 기한(KST)이 지난 다음 날부터", () => {
    expect(orderAutoReportDue({ status: "delivered", sent_at: null, report_due: "2026-11-19" }, now, 7)).toBe(true);
    expect(orderAutoReportDue({ status: "delivered", sent_at: null, report_due: "2026-11-20" }, now, 7)).toBe(false);
    expect(orderAutoReportDue({ status: "report_done", sent_at: "2026-11-01T00:00:00Z", report_due: "2026-11-01" }, now, 7)).toBe(false);
  });
});
