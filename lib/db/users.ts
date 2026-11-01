import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/config";

/**
 * 역할별 사용자 목록 (JWT app_metadata.role). profiles에 role을 두지 않으므로(CLAUDE.md 규칙 8) Auth Admin API를 페이지 단위로 끝까지 읽는다.
 * 요청 단위 캐시. 사용자 수가 수천을 넘으면 settings에 직원 id 목록을 두는 방식으로 바꾼다.
 */
export const listUsersByRole = cache(async (roles: readonly Role[]) => {
  const db = createAdminClient();
  const out: { id: string; email: string | null; role: Role }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      const r = u.app_metadata?.role as Role | undefined;
      if (r && roles.includes(r)) out.push({ id: u.id, email: u.email ?? null, role: r });
    }
    if (data.users.length < 1000) break;
  }
  return out;
});
