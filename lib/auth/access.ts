/**
 * 경로별 접근 규칙 (순수 함수, 미들웨어·테스트에서 사용). PRD 2장·6장.
 * 브랜드 멤버십(slug ↔ 세션)은 여기서 보지 않고 app/b/[slug]/layout.tsx 가 DB로 검증한다.
 */
import { isBrandRole, isCnRole, type Role } from "@/lib/config";

export type Access = "allow" | "login" | "forbidden";

const PUBLIC_PREFIXES = ["/", "/login", "/invite", "/auth", "/apply", "/_next", "/fonts", "/favicon.ico", "/api/public", "/api/cron"]; // /api/cron 은 라우트가 CRON_SECRET Bearer 로 자체 인증 (r5 리뷰 1)

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")));
}

export function routeAccess(pathname: string, role: Role | null | undefined): Access {
  if (isPublicPath(pathname)) return "allow";
  if (!role) return "login";
  if (pathname === "/home") return "allow";
  if (pathname.startsWith("/admin")) return role === "ADMIN" ? "allow" : "forbidden";
  if (pathname.startsWith("/cn")) return isCnRole(role) || role === "ADMIN" ? "allow" : "forbidden";
  if (pathname.startsWith("/b/")) return isBrandRole(role) || role === "ADMIN" ? "allow" : "forbidden";
  return "forbidden";
}

/** 역할별 홈. 브랜드는 slug가 필요하므로 /home 라우트가 DB를 보고 결정한다. */
export function roleHome(role: Role): string {
  if (role === "ADMIN") return "/admin";
  if (isCnRole(role)) return "/cn";
  return "/home";
}

/** 브랜드 slug 형식 검증 (0002 brands.slug check와 동일) */
export const isValidSlug = (s: string) => /^[a-z0-9-]{3,40}$/.test(s);

/** next 파라미터 오픈 리다이렉트 방지: 같은 오리진 경로만 허용 */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  if (!next) return fallback;
  // "/" 로 시작하되 "//", "/\\" (브라우저가 //로 해석) 는 차단
  if (!/^\/(?![\/\\])/.test(next)) return fallback;
  return next;
}
