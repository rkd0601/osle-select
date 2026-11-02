import { describe, it, expect } from "vitest";
import { orderInvoice } from "@/lib/orders";

describe("orders r5 — 음수 청구서 금지", () => {
  it("선금·차감이 청구액을 넘으면 총 청구 0 + 환불 예정", () => {
    const inv = orderInvoice({
      groups: [{ offerId: "a", fee_rate: 0.2, price_tiers: [{ min_qty: 30, product_price_krw: 10000 }], lines: [{ lineId: "l1", qty: 10 }] }],
      deposit_paid_krw: 500000,
    } as Parameters<typeof orderInvoice>[0]);
    expect(inv.total_krw).toBe(0);
    expect(inv.refund_due_krw).toBe(500000 - (100000 + 20000));
  });
});
