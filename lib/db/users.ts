import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Role } from "@/lib/config";

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

/**
 * 이름·이메일 디렉터리 (B-10 멤버 목록). profiles RLS는 본인만 보여 주므로 서비스 롤로 채운다 —
 * 호출부가 RLS로 확인한 id(같은 브랜드 멤버)만 넘긴다. 역할·원가 정보는 돌려주지 않는다.
 */
export async function memberDirectory(ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>();
  if (!ids.length) return out;
  const [{ data: profiles }, users] = await Promise.all([createAdminClient().from("profiles").select("id, display_name").in("id", ids), listUsersByRole(ROLES)]);
  for (const id of ids) out.set(id, { name: profiles?.find((p) => p.id === id)?.display_name ?? "", email: users.find((u) => u.id === id)?.email ?? "" });
  return out;
}
