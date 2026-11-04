import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/access";
import { redirectTo } from "@/lib/http";

/** OAuth(카카오)·매직링크 콜백: code → 세션 교환 후 next로. 이동은 상대 주소(lib/http — 사내망 주소에서도 쿠키 유지). */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(next);
  }
  return redirectTo("/login?error=callback");
}
