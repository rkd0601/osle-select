import { describe, it, expect } from "vitest";
import { assertTransition, canTransition, allowedNext, canAddToOrder, publishChecks, canRequestReview } from "@/lib/transitions";
import { ownerAndDue } from "@/lib/sla";

describe("transitions", () => {
  it("발주 체인 순서: 재고 확인 전에 선금을 안내할 수 없다", () => {
    expect(canTransition("order", "reserved", "deposit_pending", "ADMIN")).toBe(false);
    expect(canTransition("order", "reserved", "stock_checking", "ADMIN")).toBe(true);
    expect(canTransition("order", "stock_confirmed", "deposit_pending", "ADMIN")).toBe(true);
    expect(canTransition("order", "deposit_pending", "quoting", "ADMIN")).toBe(false); // 홀딩 확정을 건너뛸 수 없음
    expect(canTransition("order", "hold_confirmed", "quoting", "ADMIN")).toBe(true);
    expect(canTransition("order", "quoted", "confirmed", "ADMIN")).toBe(false); // 수량 확정·최종 견적 생략 불가
  });

  it("역할 제한: CN은 재고 응답만, 브랜드는 수량 확정만", () => {
    expect(canTransition("order", "stock_checking", "stock_confirmed", "CN_SOURCER")).toBe(true);
    expect(canTransition("order", "stock_checking", "stock_confirmed", "BRAND_OWNER")).toBe(false);
    expect(canTransition("order", "quoted", "qty_confirmed", { role: "BRAND_OWNER", canPurchase: true })).toBe(true);
    expect(canTransition("order", "quoted", "qty_confirmed", "BRAND_OWNER")).toBe(false); // canPurchase 미확인이면 불가
    expect(canTransition("order", "quoted", "qty_confirmed", { role: "BRAND_MEMBER", canPurchase: true })).toBe(true); // 위임받은 member
    expect(canTransition("order", "quoted", "qty_confirmed", { role: "BRAND_MEMBER", canPurchase: false })).toBe(false);
    expect(() => assertTransition("order", "final_quoted", "cn_shipped", "ADMIN")).toThrow();
  });

  it("검수와 발행 분리: reviewed → offering은 ADMIN만, CN은 recheck만", () => {
    expect(canTransition("product", "pending_review", "reviewed", "ADMIN")).toBe(true);
    expect(canTransition("product", "pending_review", "reviewed", "CN_SOURCER")).toBe(false);
    expect(canTransition("product", "reviewed", "offering", "ADMIN")).toBe(true);
    expect(canTransition("product", "offering", "recheck", "CN_SOURCER")).toBe(true);
    expect(allowedNext("product", "draft", "CN_VENDOR")).toEqual(["pending_review"]);
    // d-23: 초안 숨김·숨김 → 초안 되돌림은 관리자만 (E2E 고정 이름 상품 재사용)
    expect(allowedNext("product", "draft", "ADMIN")).toEqual(["pending_review", "hidden"]);
    expect(canTransition("product", "draft", "hidden", "CN_SOURCER")).toBe(false);
    expect(canTransition("product", "hidden", "draft", "ADMIN")).toBe(true);
    expect(canTransition("product", "hidden", "draft", "CN_SOURCER")).toBe(false);
  });

  it("제안: 브랜드 반응, 재확인은 관리자, 재동의는 owner", () => {
    expect(canTransition("offer", "new", "interested", "BRAND_MEMBER")).toBe(true);
    expect(canTransition("offer", "new", "recheck", "BRAND_OWNER")).toBe(false);
    expect(canTransition("offer", "reconsent_pending", "interested", { role: "BRAND_MEMBER", canPurchase: false })).toBe(false);
    expect(canTransition("offer", "reconsent_pending", "interested", { role: "BRAND_OWNER", canPurchase: true })).toBe(true);
  });

  it("샘플: 입금 대기 → (관리자 입금 확인) → 출고 준비 → CN 출고, 피드백은 브랜드", () => {
    expect(canTransition("sample_request", "awaiting_payment", "cn_shipped", "CN_SOURCER")).toBe(false);
    expect(canTransition("sample_request", "awaiting_payment", "requested", "ADMIN")).toBe(true);
    expect(canTransition("sample_request", "requested", "cn_shipped", "CN_SOURCER")).toBe(true);
    expect(canTransition("sample_request", "delivered", "feedback_done", "BRAND_MEMBER")).toBe(true);
    expect(canTransition("sample_request", "delivered", "feedback_done", "CN_SOURCER")).toBe(false);
  });

  it("발주서 담기 조건", () => {
    expect(canAddToOrder({ offer_reaction: "interested", sample_feedback: "interested", has_reorder_history: false, admin_waived: false })).toBe(true);
    expect(canAddToOrder({ offer_reaction: "interested", sample_feedback: "hold", has_reorder_history: false, admin_waived: false })).toBe(false);
    expect(canAddToOrder({ offer_reaction: "interested", sample_feedback: null, has_reorder_history: true, admin_waived: false })).toBe(true);
    expect(canAddToOrder({ offer_reaction: "hold", sample_feedback: "interested", has_reorder_history: false, admin_waived: false })).toBe(false);
    expect(canAddToOrder({ offer_reaction: "hold", sample_feedback: null, has_reorder_history: false, admin_waived: true }), "면제도 제안 관심일 때만 (r5-4)").toBe(false);
    expect(canAddToOrder({ offer_reaction: "interested", sample_feedback: null, has_reorder_history: false, admin_waived: true })).toBe(true);
  });

  it("공개 조건: 중량·실물 확인·사진 5장 중 하나라도 빠지면 불가", () => {
    const base = {
      verified_in_person: true, photo_count: 6, has_real_photo: true, sample_ok: true, fabric_pct_sum: 100,
      origin: "CN", care_codes: ["dry"], min_qty: 30, weight_g: 480, hold_resolved: true, supply_type: "stock", vendor_id: "v1",
      color_count: 2, size_count: 3, cost_tier_count: 2, lead_days: null, production_moq: null,
    };
    expect(canRequestReview(publishChecks(base))).toBe(true);
    expect(canRequestReview(publishChecks({ ...base, weight_g: null }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, photo_count: 4 }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, has_real_photo: false }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, sample_ok: false }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, fabric_pct_sum: 95 }))).toBe(false);
    // 기획서 F3: 컬러·사이즈·원가 구간, 생산이면 리드타임·MOQ
    expect(canRequestReview(publishChecks({ ...base, color_count: 0 }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, size_count: 0 }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, cost_tier_count: 0 }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, supply_type: "production" }))).toBe(false);
    expect(canRequestReview(publishChecks({ ...base, supply_type: "production", lead_days: 15, production_moq: 100 }))).toBe(true);
  });

  it("SLA: 상태마다 담당자와 기한", () => {
    const now = new Date("2026-11-02T00:00:00Z"); // 월요일
    const a = ownerAndDue("request_item", "received", now);
    expect(a.owner_role).toBe("ADMIN");
    expect(a.due_at?.toISOString().slice(0, 10)).toBe("2026-11-03");
    const b = ownerAndDue("order", "stock_checking", now);
    expect(b.owner_role).toBe("CN");
    const c = ownerAndDue("offer", "new", now);
    expect(c.owner_role).toBe("BRAND");
    expect(c.due_at?.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(ownerAndDue("order", "report_done", now).owner_role).toBeNull();
  });
});
