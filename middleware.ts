import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routeAccess } from "@/lib/auth/access";
import { redirectTo } from "@/lib/http";
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
    // 상대 Location — 절대 주소는 dev 서버에서 localhost로 만들어져 사내망 주소 접속 때 쿠키를 잃는다(lib/http 참고)
    const res = redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
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
