import { describe, expect, it } from "vitest";
import { fitWithin, MAX_EDGE, shrinkPhoto } from "@/lib/images/resize";

describe("사진 축소", () => {
  it("긴 변을 1600px 안으로, 작은 사진은 그대로", () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: MAX_EDGE, h: 1200 });
    expect(fitWithin(800, 1000)).toEqual({ w: 800, h: 1000 });
  });
  it("shrinkPhoto는 사진 하나만 받는다 — files.map(shrinkPhoto)의 순번이 크기 한도로 들어가면 0px·1px가 된다 (11-09 회귀)", () => {
    expect(shrinkPhoto.length).toBe(1);
  });
});
