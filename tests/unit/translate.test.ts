import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

/** 번역 모듈: 키가 없으면 API를 부르지 않는다. 원가 필드 차단은 lib/translate의 타입 단언(tsc)이 맡는다. */
describe("translate", () => {
  it("ANTHROPIC_API_KEY가 없으면 unavailable", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { translate } = await import("@/lib/translate");
    const res = await translate({ from: "ko", to: "zh-CN", segments: [{ field: "item_description", text: "에코퍼 자켓" }] });
    expect(res).toEqual({ ok: false, error: "translate.unavailable" });
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
  it("빈 텍스트는 호출 없이 그대로", async () => {
    const { translate } = await import("@/lib/translate");
    expect(await translate({ from: "ko", to: "zh-CN", segments: [{ field: "comment", text: "  " }] })).toEqual({ ok: true, data: [""] });
  });
});
