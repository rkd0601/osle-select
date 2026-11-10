import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { translate } from "@/lib/translate";
import { intakeSlaDate, ownerAndDue } from "@/lib/sla";
import { listCnStaff } from "@/lib/db/admin/requests";
import { draftSource, slaDateToDue } from "@/lib/requests";

/**
 * 요청 접수(번역 초안 + 배정) 공용 — 관리자 "전 스타일 번역 초안 + 담당 배정"(intakeAllItems)과
 * 단순화 v1 R1 자동 배정(브랜드 요청 제출 직후, 시스템 행위자)이 같은 규칙을 쓴다.
 * 담당자: 설정 auto_assign.by_category[카테고리] → 없으면 첫 CN_SOURCER. 중국어 설명이 없는 항목(번역 실패·사진만)은 배정하지 않는다(위아더 차례로 남는다).
 */
type Db = ReturnType<typeof createAdminClient>;
export type IntakeItem = { id: string; request_id: string; brand_id: string; seq: number; status: string; description: string | null; description_zh: string | null; assigned_to: string | null; category?: string | null };
export type AutoAssign = { enabled: boolean; by_category: Record<string, string> };

export async function getAutoAssign(): Promise<AutoAssign> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "auto_assign").maybeSingle();
  const v = (data?.value ?? null) as Partial<AutoAssign> | null;
  return { enabled: v?.enabled !== false, by_category: v?.by_category && typeof v.by_category === "object" ? v.by_category : {} };
}

/** 배정 한 건. 담당자 역할 검증은 호출부. actorId null = 시스템(자동 배정) */
export async function assignOne(db: Db, actorId: string | null, item: IntakeItem, assigneeId: string, slaDate: string): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  if (!item.description_zh?.trim()) return { ok: false, error: "request.error.needZh" };
  const due = slaDateToDue(slaDate);
  if (item.status === "assigned" || item.status === "sourcing") {
    // 재배정은 상태 전이가 아니다. 그 사이 상태가 바뀌었으면(예: assigned→offered) 덮어쓰지 않는다.
    const { owner_role, due_at } = ownerAndDue("request_item", item.status, new Date(), await getSettings(), { sla_date: due });
    const { data: upd } = await db
      .from("request_items")
      .update({ assigned_to: assigneeId, sla_date: slaDate, owner_role, due_at: due_at?.toISOString() ?? null })
      .eq("id", item.id)
      .eq("status", item.status)
      .select("id");
    if (!upd?.length) return { ok: false, error: "common.staleState" };
    await db.from("audit_logs").insert({
      actor_id: actorId, action: "request_item.reassign", entity: "request_item", entity_id: item.id,
      diff: { from: item.assigned_to, to: assigneeId, sla_date: slaDate },
    });
  } else {
    const res = await applyTransition(db, {
      entity: "request_item", id: item.id, from: item.status, to: "assigned", role: "ADMIN", actorId,
      settings: await getSettings(), ctx: { sla_date: due }, patch: { assigned_to: assigneeId, sla_date: slaDate },
    });
    if (!res.ok) return res;
  }
  await notify({ type: "request_item.assigned", assigneeId, itemId: item.id });
  return { ok: true, data: null };
}

export type IntakeResult = { translated: number; assigned: number; needZh: number; failed: number; translateError: string | null; assignee: string; slaDate: string };

/** 접수(received) 항목 전부: 중국어가 빈 항목은 한 번에 번역 초안, 그다음 담당자 배정. 보완 요청·보류·이미 배정된 항목은 건드리지 않는다 */
export async function runIntake(requestId: string, actorId: string | null, opts: { useCategoryMap: boolean }): Promise<{ ok: true; data: IntakeResult } | { ok: false; error: string }> {
  const db = createAdminClient();
  const [{ data: req }, { data: rows }, staff, { data: linkRows }, map] = await Promise.all([
    db.from("requests").select("id, target_date").eq("id", requestId).maybeSingle(),
    db.from("request_items").select("id, request_id, brand_id, seq, status, description, description_zh, assigned_to, category").eq("request_id", requestId).order("seq"),
    listCnStaff(),
    // "*": 0057(link_title) 전 DB에서도 깨지지 않게
    db.from("request_images").select("*").eq("request_id", requestId).not("source_url", "is", null),
    opts.useCategoryMap ? getAutoAssign() : Promise.resolve({ enabled: true, by_category: {} } as AutoAssign),
  ]);
  if (!req) return { ok: false, error: "common.notFound" };
  const linksOf = (itemId: string) => ((linkRows ?? []) as { request_item_id: string | null; source_url: string | null; link_title?: string | null }[]).filter((l) => l.request_item_id === itemId);
  const sourcer = staff.find((s) => s.role === "CN_SOURCER");
  if (!sourcer) return { ok: false, error: "admin.request.intake.noSourcer" };
  const assigneeFor = (cat: string | null | undefined) => {
    const id = cat ? map.by_category[cat] : undefined;
    return (id && staff.find((s) => s.id === id)) || sourcer;
  };
  const targets = ((rows ?? []) as IntakeItem[]).filter((i) => i.status === "received");
  if (!targets.length) return { ok: false, error: "admin.request.intake.none" };

  let translated = 0;
  let translateError: string | null = null;
  // 번역 재료: 메모(설명) → 링크 og:title → 도메인 (A3). 사진만 있는 항목은 사람이 적는다(needZh)
  const drafts = targets.flatMap((i) => {
    const text = !i.description_zh?.trim() ? draftSource(i.description ?? "", linksOf(i.id)) : null;
    return text ? [{ ...i, text }] : [];
  });
  if (drafts.length) {
    const res = await translate({ from: "ko", to: "zh-CN", segments: drafts.map((i) => ({ field: "item_description" as const, text: i.text })) });
    if (!res.ok) translateError = res.error;
    else {
      for (const [k, i] of drafts.entries()) {
        const zh = res.data[k]?.trim();
        if (!zh) continue;
        const { error } = await db.from("request_items").update({ description_zh: zh.slice(0, 400) }).eq("id", i.id).or("description_zh.is.null,description_zh.eq."); // 그 사이 사람이 적은 중국어는 덮어쓰지 않는다
        if (!error) { const t = targets.find((x) => x.id === i.id); if (t) t.description_zh = zh; translated++; }
      }
    }
  }

  const slaDate = intakeSlaDate(req.target_date, new Date());
  let assigned = 0, needZh = 0, failed = 0;
  for (const i of targets) {
    if (!i.description_zh?.trim()) { needZh++; continue; }
    const r = await assignOne(db, actorId, i, assigneeFor(i.category).id, slaDate);
    if (r.ok) assigned++; else failed++;
  }
  return { ok: true, data: { translated, assigned, needZh, failed, translateError, assignee: sourcer.name, slaDate } };
}
