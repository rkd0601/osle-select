import { describe, it, expect } from "vitest";
import { ADMIN_DICTS } from "@/lib/i18n/admin";
const ko = ADMIN_DICTS.ko;
const zh = ADMIN_DICTS["zh-CN"];
import { HANDOFFS, handoffFor, type HandoffEntity } from "@/lib/handoff";
import { ORDER_STATUS, SAMPLE_REQUEST_STATUS, canTransition } from "@/lib/transitions";

const K = ko as Record<string, string>;
describe("핸드오프 템플릿 14건", () => {
  it("14건, 각각 ko 제목·결정할 것(+CTA 라벨)과 zh 제목이 있다", () => {
    expect(Object.keys(HANDOFFS)).toHaveLength(14);
    for (const key of Object.keys(HANDOFFS)) {
      const [entity, status] = key.split(":") as [HandoffEntity, string];
      const h = handoffFor(entity, status)!;
      expect(K[h.title], h.title).toBeTruthy();
      expect(K[h.decide], h.decide).toBeTruthy();
      if (h.ctaLabel) expect(K[h.ctaLabel], h.ctaLabel).toBeTruthy();
      expect((zh as Record<string, string>)[h.title], `zh ${h.title}`).toBeTruthy();
    }
  });
  it("상태 이름은 실제 상태값이다", () => {
    for (const key of Object.keys(HANDOFFS)) {
      const [entity, status] = key.split(":");
      if (entity === "order") expect(ORDER_STATUS as readonly string[]).toContain(status);
      if (entity === "sample_request") expect(SAMPLE_REQUEST_STATUS as readonly string[]).toContain(status);
    }
  });
  it("브랜드 차례 카드는 브랜드가 실제로 다음 전이를 할 수 있는 상태다 (발주)", () => {
    const brand = { role: "BRAND_OWNER" as const, canPurchase: true };
    expect(canTransition("order", "quoted", "qty_confirmed", brand)).toBe(true);
    expect(canTransition("order", "sent_to_brand", "delivered", brand)).toBe(true);
    expect(canTransition("order", "delivered", "report_done", brand)).toBe(true);
    expect(handoffFor("order", "confirmed")).toBeNull(); // 진행 중 상태는 카드 없음 — 타임라인으로
  });
});
