import { describe, it, expect } from "vitest";
import { COMMENT_TARGETS, commentAudience, resolveVisibility, translationOf, type AuthorKind, type Visibility } from "@/lib/comments";

/** 통합 코멘트 규칙 전수: 행위자 × 대상 × 요청 가시성 */
const VIS: (Visibility | undefined)[] = [undefined, "brand", "internal", "cn"];

describe("코멘트 가시성", () => {
  it("브랜드는 brand만, CN은 본인 대상(항목·제안)의 cn만, 위아더는 셋 다(cn은 CN 대상만)", () => {
    for (const author of ["brand", "cn", "admin"] as AuthorKind[]) for (const target of COMMENT_TARGETS) for (const v of VIS) {
      const got = resolveVisibility(author, target, v);
      const label = `${author} ${target} ${v}`;
      if (author === "brand") expect(got, label).toBe(v === undefined || v === "brand" ? "brand" : null);
      else if (author === "cn") expect(got, label).toBe((v === undefined || v === "cn") && (target === "request_item" || target === "offer") ? "cn" : null);
      else expect(got, label).toBe(v === "cn" && !(target === "request_item" || target === "offer") ? null : (v ?? "internal"));
    }
  });
  it("브랜드는 internal·cn을 절대 쓸 수 없다 (중국어 원문·내부 메모 비노출)", () => {
    for (const target of COMMENT_TARGETS) {
      expect(resolveVisibility("brand", target, "internal")).toBeNull();
      expect(resolveVisibility("brand", target, "cn")).toBeNull();
    }
  });
});

describe("번역·알림", () => {
  it("cn 가시성만 번역: CN 작성 zh→ko, 위아더 작성 ko→zh", () => {
    expect(translationOf("cn", "cn")).toEqual({ source: "zh-CN", translateTo: "ko" });
    expect(translationOf("admin", "cn")).toEqual({ source: "ko", translateTo: "zh-CN" });
    expect(translationOf("admin", "brand").translateTo).toBeNull();
    expect(translationOf("brand", "brand").translateTo).toBeNull();
    expect(translationOf("admin", "internal").translateTo).toBeNull();
  });
  it("상대에게만 알린다: 브랜드·CN → 위아더, 위아더 → 그 가시성 상대, 내부 메모는 없음", () => {
    expect(commentAudience("brand", "brand")).toBe("admin");
    expect(commentAudience("cn", "cn")).toBe("admin");
    expect(commentAudience("admin", "brand")).toBe("brand");
    expect(commentAudience("admin", "cn")).toBe("cn");
    expect(commentAudience("admin", "internal")).toBeNull();
  });
});
