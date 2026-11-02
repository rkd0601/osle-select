import { NextResponse, type NextRequest } from "next/server";
import { checkEnv, envErrors } from "@/lib/env";
import { bearerOk } from "@/lib/auth/bearer";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 배포 헬스 체크 (12단계). 공개 응답은 ok·db 두 값뿐. `Authorization: Bearer ${CRON_SECRET}`이면 환경변수 문제 이름까지(값은 없음).
 * 캐시하지 않는다.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const issues = checkEnv(process.env, process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production");
  let db = false;
  try {
    const { error } = await createAdminClient().from("settings").select("key", { head: true, count: "exact" }).limit(1);
    db = !error;
  } catch {
    db = false;
  }
  const ok = db && envErrors(issues).length === 0;
  const body = bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET) ? { ok, db, issues } : { ok, db };
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
