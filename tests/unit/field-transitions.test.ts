import { describe, it, expect } from "vitest";
import { ROLES, type Role } from "@/lib/config";
import {
  canTransition, ORDER_LINE_BACKORDER, ORDER_LINE_STOCK, SAMPLE_ITEM_CHARGE, SAMPLE_ITEM_RETURN, SAMPLE_ITEM_STATUS, type FieldEntity,
} from "@/lib/transitions";

/**
 * 항목·라인 필드 전이 전수 (DECISIONS r4 #9, CLAUDE.md 테스트 필수 "객체별 허용/비허용 전이 전수").
 * 허용 목록에 없는 (from, to, 역할) 조합은 전부 거부돼야 한다. 구매 전이는 canPurchase 없이 거부, 있으면 허용.
 */
const CN: Role[] = ["ADMIN", "CN_SOURCER", "CN_VENDOR"];
const BRAND: Role[] = ["ADMIN", "BRAND_OWNER", "BRAND_MEMBER"];
type Allow = { from: string; to: string; by: Role[]; purchase?: boolean };
const SPEC: { entity: FieldEntity; states: readonly string[]; allow: Allow[] }[] = [
  {
    entity: "sample_item", states: SAMPLE_ITEM_STATUS,
    allow: [
      ...["ok", "defect", "unavailable"].map((to) => ({ from: "pending", to, by: ["ADMIN" as Role] })),
      { from: "ok", to: "defect", by: ["ADMIN"] }, { from: "ok", to: "unavailable", by: ["ADMIN"] },
      { from: "defect", to: "ok", by: ["ADMIN"] }, { from: "defect", to: "unavailable", by: ["ADMIN"] },
      { from: "unavailable", to: "ok", by: ["ADMIN"] }, { from: "unavailable", to: "defect", by: ["ADMIN"] },
    ],
  },
  {
    entity: "sample_item_return", states: SAMPLE_ITEM_RETURN,
    allow: [
      { from: "due", to: "returned", by: ["ADMIN"] }, { from: "due", to: "kept", by: BRAND, purchase: true },
      { from: "kept", to: "due", by: BRAND }, { from: "kept", to: "returned", by: ["ADMIN"] },
    ],
  },
  {
    entity: "sample_item_charge", states: SAMPLE_ITEM_CHARGE,
    allow: [{ from: "none", to: "charged", by: ["ADMIN"] }, { from: "charged", to: "deducted", by: ["ADMIN"] }],
  },
  {
    entity: "order_line_stock", states: ORDER_LINE_STOCK,
    allow: [
      { from: "pending", to: "confirmed", by: CN }, { from: "pending", to: "short", by: CN },
      { from: "confirmed", to: "short", by: CN }, { from: "short", to: "confirmed", by: CN }, { from: "short", to: "pending", by: ["ADMIN"] },
    ],
  },
  {
    entity: "order_line_backorder", states: ORDER_LINE_BACKORDER,
    allow: [
      { from: "none", to: "backordered", by: ["ADMIN"] }, { from: "backordered", to: "backordered", by: ["ADMIN"] },
      { from: "backordered", to: "resolved", by: ["ADMIN"] }, { from: "resolved", to: "backordered", by: ["ADMIN"] },
    ],
  },
];

describe("필드 전이 전수", () => {
  for (const spec of SPEC) {
    it(`${spec.entity}: 허용 목록 밖은 모두 거부`, () => {
      for (const from of spec.states) for (const to of spec.states) for (const role of ROLES) {
        const rule = spec.allow.find((a) => a.from === from && a.to === to && a.by.includes(role));
        const withPurchase = canTransition(spec.entity, from, to, { role, canPurchase: true });
        const without = canTransition(spec.entity, from, to, { role, canPurchase: false });
        const label = `${spec.entity} ${from}→${to} ${role}`;
        expect(withPurchase, label).toBe(!!rule);
        expect(without, label).toBe(!!rule && (!rule.purchase || role === "ADMIN"));
      }
    });
  }
  it("CN은 회수·청구·미송을 바꿀 수 없고, 브랜드는 재고 응답을 할 수 없다", () => {
    expect(canTransition("sample_item_charge", "none", "charged", "CN_SOURCER")).toBe(false);
    expect(canTransition("order_line_backorder", "none", "backordered", "CN_VENDOR")).toBe(false);
    expect(canTransition("order_line_stock", "pending", "confirmed", { role: "BRAND_OWNER", canPurchase: true })).toBe(false);
    expect(canTransition("sample_item_return", "returned", "due", "ADMIN")).toBe(false); // 반납 접수 뒤 되돌림 없음
    expect(canTransition("sample_item_charge", "deducted", "charged", "ADMIN")).toBe(false); // 차감은 1회
  });
});
