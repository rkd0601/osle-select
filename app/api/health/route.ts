import { NextResponse, type NextRequest } from "next/server";
import { checkEnv, envErrors, isProductionEnv } from "@/lib/env";
import { bearerOk } from "@/lib/auth/bearer";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 배포 헬스 체크 (12단계). 공개 응답은 ok·db 두 값뿐. `Authorization: Bearer ${CRON_SECRET}`이면 환경변수 문제 이름까지(값은 없음).
 * 공개 호출의 DB 조회는 인스턴스별 60초 캐시(DECISIONS 12-1) — 외부 모니터가 자주 불러도 DB를 매번 두드리지 않게. 상세(Bearer)는 즉시 조회.
 * 응답 자체는 CDN에 캐시하지 않는다.
 */
export const dynamic = "force-dynamic";

const DB_TTL_MS = 60_000;
let dbCache: { at: number; db: boolean } | null = null;

async function dbOk(fresh: boolean): Promise<boolean> {
  if (!fresh && dbCache && Date.now() - dbCache.at < DB_TTL_MS) return dbCache.db;
  let db = false;
  try {
    const { error } = await createAdminClient().from("settings").select("key", { head: true, count: "exact" }).limit(1);
    db = !error;
  } catch {
    db = false;
  }
  dbCache = { at: Date.now(), db };
  return db;
}

export async function GET(req: NextRequest) {
  const detail = bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET);
  const issues = checkEnv(process.env, isProductionEnv(process.env));
  const db = await dbOk(detail);
  const ok = db && envErrors(issues).length === 0;
  const body = detail ? { ok, db, issues } : { ok, db };
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
