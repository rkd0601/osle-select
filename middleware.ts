import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routeAccess } from "@/lib/auth/access";
import type { Role } from "@/lib/config";

/**
 * 세션 쿠키 갱신 + 역할 기반 라우트 가드. PRD 6장.
 * 브랜드 slug 멤버십은 app/b/[slug]/layout.tsx 에서 DB로 다시 검증한다(이중 방어).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const role = (data.user?.app_metadata?.role as Role | undefined) ?? null;
  const { pathname, search } = request.nextUrl;
  const access = routeAccess(pathname, role);

  if (access === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (access === "forbidden") {
    // 존재를 숨긴다: 404 페이지로 rewrite
    const url = request.nextUrl.clone();
    url.pathname = "/not-found";
    return NextResponse.rewrite(url, { status: 404 });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
