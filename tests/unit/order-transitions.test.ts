import { describe, it, expect } from "vitest";
import { ROLES, type Role } from "@/lib/config";
import { canTransition, ORDER_STATUS } from "@/lib/transitions";

/**
 * 발주 전이표 전수 (CLAUDE.md "객체별 허용/비허용 전이 전수", r5 리뷰 테스트 요청). 허용 목록 밖 (from, to, 역할)은 전부 거부.
 * 체인 순서: 재고 확인 → 선금 → 홀딩 → 범위 견적 → 수량 확정 → 최종 견적 → 확정 (절대 규칙 7).
 */
const A: Role[] = ["ADMIN"];
const CN: Role[] = ["ADMIN", "CN_SOURCER", "CN_VENDOR"];
const BRAND: Role[] = ["ADMIN", "BRAND_OWNER", "BRAND_MEMBER"];
type Allow = { from: string; to: string; by: Role[]; purchase?: boolean };
const P = (from: string, to: string): Allow => ({ from, to, by: BRAND, purchase: true });
const ALLOW: Allow[] = [
  { from: "reserved", to: "stock_checking", by: A }, P("reserved", "cancelled"),
  { from: "stock_checking", to: "stock_confirmed", by: CN }, { from: "stock_checking", to: "partial_confirmed", by: CN }, { from: "stock_checking", to: "stock_short", by: CN },
  { from: "stock_checking", to: "cancelled", by: A },
  { from: "stock_short", to: "stock_checking", by: A }, P("stock_short", "cancelled"),
  { from: "stock_confirmed", to: "deposit_pending", by: A }, { from: "stock_confirmed", to: "quoting", by: A }, P("stock_confirmed", "cancelled"),
  { from: "partial_confirmed", to: "deposit_pending", by: A }, { from: "partial_confirmed", to: "quoting", by: A }, P("partial_confirmed", "cancelled"),
  { from: "deposit_pending", to: "hold_confirmed", by: A }, P("deposit_pending", "cancelled"),
  { from: "hold_confirmed", to: "quoting", by: A }, { from: "hold_confirmed", to: "cancelled", by: A },
  { from: "quoting", to: "quoted", by: A }, { from: "quoting", to: "cancelled", by: A },
  P("quoted", "qty_confirmed"), P("quoted", "cancelled"),
  { from: "qty_confirmed", to: "final_quoted", by: A }, { from: "qty_confirmed", to: "quoted", by: A }, { from: "qty_confirmed", to: "cancelled", by: A },
  { from: "final_quoted", to: "confirmed", by: A }, { from: "final_quoted", to: "qty_confirmed", by: A }, { from: "final_quoted", to: "cancelled", by: A },
  { from: "confirmed", to: "cn_shipped", by: CN },
  { from: "cn_shipped", to: "kr_inspecting", by: A }, { from: "cn_shipped", to: "sent_to_brand", by: A },
  { from: "kr_inspecting", to: "sent_to_brand", by: A },
  { from: "sent_to_brand", to: "delivered", by: BRAND },
  { from: "delivered", to: "report_done", by: BRAND },
];

describe("발주 전이 전수", () => {
  it("허용 목록 밖은 모두 거부, 구매 전이는 canPurchase 필요(ADMIN 제외)", () => {
    for (const from of ORDER_STATUS) for (const to of ORDER_STATUS) for (const role of ROLES) {
      const rule = ALLOW.find((a) => a.from === from && a.to === to && a.by.includes(role));
      const label = `order ${from}→${to} ${role}`;
      expect(canTransition("order", from, to, { role, canPurchase: true }), label).toBe(!!rule);
      expect(canTransition("order", from, to, { role, canPurchase: false }), label).toBe(!!rule && (!rule.purchase || role === "ADMIN"));
    }
  });
  it("확정 이후에는 취소가 없다 (미송 라인 취소·크레딧으로)", () => {
    for (const s of ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"]) {
      expect(canTransition("order", s, "cancelled", "ADMIN"), s).toBe(false);
    }
  });
  it("브랜드는 선금 단계 이후(홀딩 확정~최종 견적)에 직접 취소할 수 없다", () => {
    for (const s of ["hold_confirmed", "quoting", "qty_confirmed", "final_quoted"]) {
      expect(canTransition("order", s, "cancelled", { role: "BRAND_OWNER", canPurchase: true }), s).toBe(false);
    }
  });
});
