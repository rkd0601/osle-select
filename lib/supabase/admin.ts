import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * 서비스 롤 클라이언트. RLS를 우회하므로 서버 액션 안에서만, 역할 검증 후에만 쓴다.
 * 원가(product_costs)·원청(vendors)·설정(settings)·용어 사전(glossary)·감사 로그는 이 클라이언트로만 접근한다.
 * CLAUDE.md 절대 규칙 8.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
