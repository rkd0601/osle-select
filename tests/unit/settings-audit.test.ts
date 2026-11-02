import { describe, it, expect } from "vitest";
import ko from "@/lib/i18n/ko.json";
import { DEFAULT_SETTINGS } from "@/lib/config";
import { ALL_NUMERIC_KEYS, ListSchemas, NUMERIC_SETTINGS, fromInput, numericDef, settingAuditAction, toInput, validNumeric } from "@/lib/settings-schema";
import { isMoneyAction, kstEndExclusive, kstStart, moneyOrFilter, parseAuditFilter } from "@/lib/audit";

const K = ko as Record<string, string>;

describe("A-08 설정 키 정의", () => {
  it("숫자 키 = DEFAULT_SETTINGS 전부, 중복 없음, 기본값이 범위 안", () => {
    expect(NUMERIC_SETTINGS.map((d) => d.key).sort()).toEqual([...ALL_NUMERIC_KEYS].sort());
    expect(new Set(NUMERIC_SETTINGS.map((d) => d.key)).size).toBe(NUMERIC_SETTINGS.length);
    for (const d of NUMERIC_SETTINGS) expect(validNumeric(d, DEFAULT_SETTINGS[d.key]), d.key).toBe(true);
  });
  it("라벨·단위·그룹 i18n 키가 있다", () => {
    for (const d of NUMERIC_SETTINGS) {
      expect(K[`settings.key.${d.key}`], d.key).toBeTruthy();
      expect(K[`settings.unit.${d.unit}`], d.unit).toBeTruthy();
      expect(K[`settings.group.${d.group}`], d.group).toBeTruthy();
    }
    for (const k of Object.keys(ListSchemas)) expect(K[`settings.key.${k}`], k).toBeTruthy();
  });
  it("범위·정수·비율 소수 자리", () => {
    const fx = numericDef("fx_rate_cny_krw")!;
    expect(validNumeric(fx, 195)).toBe(true);
    expect(validNumeric(fx, 195.5)).toBe(false);
    expect(validNumeric(fx, 50)).toBe(false);
    const m = numericDef("hidden_margin_rate")!;
    expect(validNumeric(m, 0.2)).toBe(true);
    expect(validNumeric(m, 0.12345)).toBe(false);
    expect(validNumeric(m, 0.9)).toBe(false);
    expect(validNumeric(m, Number.NaN)).toBe(false);
    expect(numericDef("nope")).toBeUndefined();
  });
  it("% 입력 ↔ 저장값", () => {
    const m = numericDef("hidden_margin_rate")!;
    expect(toInput(m, 0.2)).toBe(20);
    expect(fromInput(m, "20")).toBe(0.2);
    expect(fromInput(m, "3.5")).toBe(0.035);
    const fx = numericDef("fx_rate_cny_krw")!;
    expect(fromInput(fx, "1,95")).toBe(195);
    expect(toInput(fx, 195)).toBe(195);
  });
  it("목록 키 검사: 카테고리 중복·템플릿 코드 형식·계좌 번호 형식·계좌 비우기", () => {
    expect(ListSchemas.categories.safeParse(["아우터", "상의"]).success).toBe(true);
    expect(ListSchemas.categories.safeParse(["아우터", "아우터"]).success).toBe(false);
    expect(ListSchemas.categories.safeParse([]).success).toBe(false);
    expect(ListSchemas.rejection_templates.safeParse([{ code: "photos", ko: "사진 부족", zh: "照片不足" }]).success).toBe(true);
    expect(ListSchemas.rejection_templates.safeParse([{ code: "Bad Code", ko: "x", zh: "x" }]).success).toBe(false);
    expect(ListSchemas.rejection_templates.safeParse([{ code: "a1", ko: "x", zh: "y" }, { code: "a1", ko: "z", zh: "w" }]).success).toBe(false);
    expect(ListSchemas.bank_account.safeParse({ bank: "국민", number: "123-456-7890", holder: "위아더" }).success).toBe(true);
    expect(ListSchemas.bank_account.safeParse({ bank: "국민", number: "abc", holder: "위아더" }).success).toBe(false);
    expect(ListSchemas.bank_account.safeParse(null).success).toBe(true);
  });
  it("감사 액션: 환율만 settings.fx_update, 나머지 settings.update — 둘 다 돈 탭", () => {
    expect(settingAuditAction("fx_rate_cny_krw")).toBe("settings.fx_update");
    expect(settingAuditAction("hidden_margin_rate")).toBe("settings.update");
    expect(isMoneyAction("settings.fx_update")).toBe(true);
    expect(isMoneyAction("settings.update")).toBe(true);
  });
});

describe("감사 로그 분류·필터", () => {
  it("돈 관련: price.* · payment.* · settings.* · 발주 확정·크레딧·청구 재생성·브랜드 조건·샘플 청구", () => {
    for (const a of ["price.cost_update", "payment.confirm", "settings.update", "order.confirm", "order.credit", "order.invoice_rebuild", "brand.credit_adjust", "brand.terms_update", "sample.charge", "sample.credit"]) expect(isMoneyAction(a), a).toBe(true);
    for (const a of ["transition", "order.reserve", "glossary.add", "export.create", "brand.invite", "order.confirmed_x"]) expect(isMoneyAction(a), a).toBe(false);
    expect(moneyOrFilter()).toContain("action.like.price.*");
    expect(moneyOrFilter()).toContain("action.eq.order.confirm");
  });
  it("검색 파라미터는 형식이 맞는 것만 받는다", () => {
    const f = parseAuditFilter({ tab: "money", actor: "00000000-0000-0000-0000-000000000001", entity: "order", action: "order.", from: "2026-11-01", to: "2026-11-02", page: "3" });
    expect(f).toEqual({ tab: "money", actor: "00000000-0000-0000-0000-000000000001", entity: "order", action: "order.", from: "2026-11-01", to: "2026-11-02", page: 3 });
    const bad = parseAuditFilter({ tab: "x", actor: "1 or 1=1", entity: "Order;drop", action: "a%", from: "11/01", page: "-4" });
    expect(bad).toEqual({ tab: "all", actor: undefined, entity: undefined, action: undefined, from: undefined, to: undefined, page: 1 });
  });
  it("기간은 KST 날짜 경계", () => {
    expect(kstStart("2026-11-02")).toBe("2026-11-01T15:00:00.000Z");
    expect(kstEndExclusive("2026-11-02")).toBe("2026-11-02T15:00:00.000Z");
  });
});
