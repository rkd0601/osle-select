import { describe, it, expect } from "vitest";
import { middlewareRedirect, redirectTo } from "@/lib/http";

describe("middlewareRedirect (§0-l 9차 — 로그인 풀린 보호 화면 500)", () => {
  it("브라우저가 연 Host 기준 절대 주소 (사내망 주소 유지)", () => {
    const h = new Headers({ host: "10.34.103.69:3000" });
    const r = middlewareRedirect(h, "http://0.0.0.0:3000", "/login?next=%2Fb%2Fa");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("http://10.34.103.69:3000/login?next=%2Fb%2Fa");
  });
  it("프록시 뒤면 X-Forwarded-Host·Proto", () => {
    const h = new Headers({ host: "internal:3000", "x-forwarded-host": "select.example.com", "x-forwarded-proto": "https" });
    expect(middlewareRedirect(h, "http://internal:3000", "/login").headers.get("location")).toBe("https://select.example.com/login");
  });
  it("바깥 경로·이상한 Host는 막는다", () => {
    expect(middlewareRedirect(new Headers({ host: "a.com" }), "http://a.com", "//evil.com").headers.get("location")).toBe("http://a.com/");
    expect(middlewareRedirect(new Headers({ host: "a.com/evil" }), "http://fallback.test", "/x").headers.get("location")).toBe("http://fallback.test/x");
  });
  it("route handler용 redirectTo는 상대 그대로", () => {
    expect(redirectTo("/login").headers.get("location")).toBe("/login");
  });
});
