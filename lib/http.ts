import { NextResponse } from "next/server";

/**
 * 같은 사이트 안 이동(상대 Location). `new URL(request.url).origin`으로 절대 주소를 만들면
 * dev 서버가 실제 접속 주소(예: 사내망 10.x.x.x) 대신 localhost를 돌려줘 다른 컴퓨터에서 로그인 쿠키를 잃는다(2026-11-04).
 * 상대 Location은 브라우저가 지금 주소 기준으로 푼다(RFC 9110). path는 "/"로 시작하는 내부 경로만 — 호출부가 safeNext로 거른다.
 */
export function redirectTo(path: string, status: 303 | 307 = 307): NextResponse {
  const safe = /^\/(?![\/\\])/.test(path) ? path : "/";
  return new NextResponse(null, { status, headers: { Location: safe } });
}

/**
 * 미들웨어 전용 이동(§0-l 9차 — 로그인 풀린 채 보호 화면에 들어가면 500이던 것). Next 미들웨어 어댑터는 Location을 `new NextURL()`로
 * 다시 읽어 **상대 주소면 "Invalid URL"로 죽는다**. 그래서 절대 주소를 만들되, 기준은 request.url(dev에서 0.0.0.0·localhost)이 아니라
 * 브라우저가 실제로 연 주소(Host / X-Forwarded-Host) — 사내망 10.x 주소로 접속해도 쿠키를 잃지 않는다(redirectTo와 같은 이유).
 */
export function middlewareRedirect(headers: Headers, fallbackOrigin: string, path: string, status: 303 | 307 = 307): NextResponse {
  const safe = /^\/(?![\/\\])/.test(path) ? path : "/";
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(fallbackOrigin).protocol.replace(":", "");
  const origin = host && /^[\w.\-:[\]]+$/.test(host) ? `${proto === "https" ? "https" : "http"}://${host}` : fallbackOrigin;
  return NextResponse.redirect(new URL(safe, origin), status);
}
