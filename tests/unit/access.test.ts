import { describe, it, expect } from "vitest";
import { routeAccess, isPublicPath, safeNext, isValidSlug, roleHome } from "@/lib/auth/access";

describe("route access", () => {
  it("공개 경로", () => {
    for (const p of ["/", "/login", "/invite/abc", "/auth/callback", "/apply", "/fonts/x.woff2"]) expect(isPublicPath(p)).toBe(true);
    expect(isPublicPath("/admin")).toBe(false);
  });
  it("미로그인 → login", () => {
    expect(routeAccess("/admin", null)).toBe("login");
    expect(routeAccess("/b/osle-muz", null)).toBe("login");
    expect(routeAccess("/cn", undefined)).toBe("login");
  });
  it("역할별 영역", () => {
    expect(routeAccess("/admin", "ADMIN")).toBe("allow");
    expect(routeAccess("/admin", "BRAND_OWNER")).toBe("forbidden");
    expect(routeAccess("/cn/products", "CN_VENDOR")).toBe("allow");
    expect(routeAccess("/cn", "BRAND_MEMBER")).toBe("forbidden");
    expect(routeAccess("/b/osle-muz/offers", "BRAND_MEMBER")).toBe("allow");
    expect(routeAccess("/b/osle-muz", "CN_SOURCER")).toBe("forbidden");
    expect(routeAccess("/b/osle-muz", "ADMIN")).toBe("allow"); // 관리자 대행 (멤버십은 레이아웃에서)
    expect(routeAccess("/home", "BRAND_OWNER")).toBe("allow");
  });
  it("오픈 리다이렉트 방지", () => {
    expect(safeNext("/b/osle-muz")).toBe("/b/osle-muz");
    expect(safeNext("//evil.com")).toBe("/home");
    expect(safeNext("/\\evil.com")).toBe("/home");
    expect(safeNext("https://evil.com")).toBe("/home");
    expect(safeNext(null)).toBe("/home");
  });
  it("slug·홈", () => {
    expect(isValidSlug("osle-muz")).toBe(true);
    expect(isValidSlug("Osle Muz")).toBe(false);
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(roleHome("CN_VENDOR")).toBe("/cn");
    expect(roleHome("BRAND_OWNER")).toBe("/home");
  });
});
