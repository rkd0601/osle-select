import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 서버 컴포넌트·서버 액션용. 사용자 세션(JWT)으로 동작하므로 RLS가 적용된다. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* RSC에서 쿠키 쓰기 불가 — 미들웨어가 갱신 */
        }
      },
    },
  });
}

/** 현재 사용자의 역할(JWT app_metadata.role). 없으면 null. */
export async function currentRole() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return (data.user?.app_metadata?.role as string | undefined) ?? null;
}
