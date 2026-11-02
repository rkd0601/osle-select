import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listUsersByRole } from "@/lib/db/users";
import { ROLES } from "@/lib/config";
import { AUDIT_PAGE_SIZE, kstEndExclusive, kstStart, moneyOrFilter, type AuditFilter } from "@/lib/audit";

/** 감사 로그 화면·설정 이력 (ADMIN 전용, 서비스 롤). 행위자 이름은 profiles.display_name → 없으면 이메일 */
async function actorNames(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, string>();
  const [{ data: profiles }, users] = await Promise.all([
    createAdminClient().from("profiles").select("id, display_name").in("id", uniq),
    listUsersByRole(ROLES),
  ]);
  const out = new Map<string, string>();
  for (const id of uniq) out.set(id, profiles?.find((p) => p.id === id)?.display_name || users.find((u) => u.id === id)?.email || id.slice(0, 8));
  return out;
}

export async function settingsHistory(limit: number) {
  const { data } = await createAdminClient().from("settings_history").select("id, key, old_value, new_value, changed_by, changed_at").order("changed_at", { ascending: false }).limit(limit);
  const names = await actorNames((data ?? []).map((h) => h.changed_by as string));
  return (data ?? []).map((h) => ({ ...h, actor: h.changed_by ? names.get(h.changed_by) ?? "" : "" }));
}

export async function auditLogs(f: AuditFilter) {
  const db = createAdminClient();
  let q = db.from("audit_logs").select("id, actor_id, action, entity, entity_id, diff, on_behalf_of_brand_id, created_at, brands:on_behalf_of_brand_id(name, slug)", { count: "exact" });
  if (f.tab === "money") q = q.or(moneyOrFilter());
  if (f.tab === "proxy") q = q.not("on_behalf_of_brand_id", "is", null);
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.entity) q = q.eq("entity", f.entity);
  if (f.action) q = q.like("action", `${f.action}%`);
  if (f.from) q = q.gte("created_at", kstStart(f.from));
  if (f.to) q = q.lt("created_at", kstEndExclusive(f.to));
  const start = (f.page - 1) * AUDIT_PAGE_SIZE;
  const { data, count } = await q.order("created_at", { ascending: false }).range(start, start + AUDIT_PAGE_SIZE - 1);
  const names = await actorNames((data ?? []).map((r) => r.actor_id as string));
  return {
    rows: (data ?? []).map((r) => ({ ...r, actor: r.actor_id ? names.get(r.actor_id) ?? "" : null, proxyBrand: ((Array.isArray(r.brands) ? r.brands[0] : r.brands) as { name?: string } | null)?.name ?? null })),
    total: count ?? 0,
  };
}

/** 필터 선택지: 행위자(ADMIN·CN·브랜드 전원은 많아 감사 로그에 나온 사람만), 대상 종류 */
export async function auditFilterOptions() {
  const db = createAdminClient();
  const { data } = await db.from("audit_logs").select("actor_id, entity").order("created_at", { ascending: false }).limit(2000);
  const names = await actorNames((data ?? []).map((r) => r.actor_id as string));
  return {
    actors: [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    entities: [...new Set((data ?? []).map((r) => r.entity as string))].sort(),
  };
}
