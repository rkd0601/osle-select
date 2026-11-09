import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** PRD D13 (2026-11-09 사이트 수정 9): 구매한 샘플값은 샘플 청구에서만 — 발주 금액 계산이 샘플 구매분을 끌어오지 않는다 */
describe("구매 샘플은 발주에서 차감하지 않는다", () => {
  it("loadOrderForCalc가 charged 샘플을 읽지 않는다", () => {
    const src = readFileSync("lib/db/admin/orders.ts", "utf8");
    const body = src.slice(src.indexOf("export async function loadOrderForCalc"), src.indexOf("export function finalInvoiceParts"));
    expect(body).not.toMatch(/from\("sample_items"\)/);
    expect(body).toMatch(/const keptSamples: .*= \[\];/);
  });
});
