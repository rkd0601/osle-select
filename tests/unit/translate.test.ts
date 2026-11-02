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

describe("용어 사전 자동 적재 후보 (r8-3)", () => {
  it("컬러명·짧은 단어만, 사전에 있는 짝·문장·한자/한글 없는 짝은 제외, 방향 무관 (zh, ko)", async () => {
    const { termCandidates } = await import("@/lib/translate/terms");
    const zh = termCandidates(
      "zh-CN",
      [
        { field: "color_name", text: "杏色" },
        { field: "color_name", text: "黑色" },
        { field: "item_description", text: "面料" },
        { field: "item_description", text: "这件外套很保暖，适合冬天" },
        { field: "product_name", text: "仿皮草短款翻领外套" },
        { field: "color_name", text: "" },
      ],
      ["살구", "블랙", "원단", "이 아우터는 따뜻해서 겨울에 좋아요", "에코퍼 크롭 카라 자켓", ""],
      [{ term_zh: "黑色", term_ko: "블랙" }],
    );
    expect(zh).toEqual([{ term_zh: "杏色", term_ko: "살구" }, { term_zh: "面料", term_ko: "원단" }]);
    const ko = termCandidates("ko", [{ field: "color_name", text: "아이보리" }, { field: "comment", text: "OK" }], ["象牙白", "好的"], []);
    expect(ko).toEqual([{ term_zh: "象牙白", term_ko: "아이보리" }]);
  });
});
