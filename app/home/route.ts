import { redirectTo } from "@/lib/http";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/access";
import { isBrandRole } from "@/lib/config";

/** 역할별 홈으로 보낸다. 브랜드는 소속 브랜드 slug가 필요해서 DB를 본다. */
/** 이동은 상대 주소(lib/http) — dev 서버의 request.url은 사내망 주소로 들어와도 localhost라 다른 컴퓨터에서 로그인이 끊겼다 */
export async function GET() {
  const u = await getSessionUser();
  if (!u) {
    // 로그인은 됐지만 역할이 없거나(초대 미수락·승인 전) 비활성 → 세션을 끊고 사유를 보여준다. 그냥 /login으로 보내면 middleware와 루프.
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.auth.signOut();
      return redirectTo(`/login?error=no-role`);
    }
    return redirectTo(`/login`);
  }
  if (!isBrandRole(u.role)) return redirectTo(`${roleHome(u.role)}`);
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("slug").order("created_at").limit(1);
  const slug = data?.[0]?.slug;
  if (!slug) return redirectTo(`/login?error=no-brand`);
  return redirectTo(`/b/${slug}`);
}
