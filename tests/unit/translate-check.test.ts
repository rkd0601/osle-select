import { describe, it, expect } from "vitest";
import { bigramSimilarity, checkField, glossaryMisses } from "@/lib/translate/check";

const G = [{ term_zh: "仿皮草", term_ko: "에코퍼" }, { term_zh: "针织", term_ko: "니트" }];

describe("번역 검증 (A-03 하이라이트)", () => {
  it("bigram 유사도: 같으면 1, 전혀 다르면 0, 문장부호·공백 무시", () => {
    expect(bigramSimilarity("仿皮草短款外套", "仿皮草短款外套")).toBe(1);
    expect(bigramSimilarity("仿皮草短款外套", "牛仔裤")).toBe(0);
    expect(bigramSimilarity("에코퍼, 크롭 자켓", "에코퍼 크롭자켓")).toBe(1);
  });
  it("사전 위반: 원문 용어의 대응어가 번역에 없으면", () => {
    expect(glossaryMisses("仿皮草短款外套", "인조 모피 숏 자켓", G, "zh>ko")).toEqual(["仿皮草→에코퍼"]);
    expect(glossaryMisses("仿皮草短款外套", "에코퍼 숏 자켓", G, "zh>ko")).toEqual([]);
    expect(glossaryMisses("니트 가디건", "开衫", G, "ko>zh")).toEqual(["니트→针织"]);
  });
  it("불확실: 역번역이 많이 다르거나, 사전 위반, 번역이 비었을 때", () => {
    expect(checkField("仿皮草短款翻领外套", "에코퍼 크롭 카라 자켓", "仿皮草短款翻领外套", G, "zh>ko").uncertain).toBe(false);
    expect(checkField("仿皮草短款翻领外套", "에코퍼 크롭 카라 자켓", "环保毛皮夹克", G, "zh>ko").uncertain).toBe(true);
    expect(checkField("仿皮草短款", "인조모피 숏", "仿皮草短款", G, "zh>ko").uncertain).toBe(true);
    expect(checkField("面料很软", "", "", G, "zh>ko").uncertain).toBe(true);
  });
});
