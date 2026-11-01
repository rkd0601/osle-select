import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { t, type Locale } from "@/lib/i18n";
import { listUsersByRole } from "@/lib/db/users";

/**
 * 알림 한 곳 (CLAUDE.md 코딩 규칙). 이벤트 → kind(instant|digest)·수신자·채널 결정.
 * 3단계: 인앱(notifications 행)만. 이메일(Resend)·WeCom·다이제스트 발송은 8단계에서 이 함수 안에 붙인다.
 * 문구는 i18n 템플릿 키(notify.<type>.title)로, 수신자 로케일에 맞춰 만든다.
 */
export type NotifyEvent =
  | { type: "request.created"; brandId: string; requestId: string; itemCount: number }
  | { type: "request_item.needs_info"; brandId: string; brandSlug: string; requestId: string; itemSeq: number }
  | { type: "request_item.info_supplied"; brandId: string; requestId: string; itemSeq: number }
  | { type: "request_item.assigned"; assigneeId: string; itemId: string }
  | { type: "cn_question.created"; requestId: string; itemId: string };

type Recipient = { id: string; locale: Locale };
const INSTANT = new Set<NotifyEvent["type"]>(["request_item.needs_info", "request_item.assigned", "cn_question.created", "request_item.info_supplied"]);

/** ADMIN 목록 (JWT app_metadata.role). 요청 단위 캐시 — profiles에 role을 두지 않는 원칙(CLAUDE.md 규칙 8)을 지키면서 listUsers 반복 호출을 줄인다 */
const admins = cache(async (): Promise<Recipient[]> => (await listUsersByRole(["ADMIN"])).map((u) => ({ id: u.id, locale: "ko" as const })));
async function brandMembers(brandId: string): Promise<Recipient[]> {
  const { data } = await createAdminClient().from("brand_members").select("profile_id").eq("brand_id", brandId);
  return (data ?? []).map((m) => ({ id: m.profile_id, locale: "ko" as const }));
}

function route(e: NotifyEvent): { to: () => Promise<Recipient[]>; link: (r: Recipient) => string; vars: Record<string, string | number> } {
  switch (e.type) {
    case "request.created":
      return { to: admins, link: () => `/admin/requests/${e.requestId}`, vars: { n: e.itemCount } };
    case "request_item.info_supplied":
      return { to: admins, link: () => `/admin/requests/${e.requestId}`, vars: { seq: e.itemSeq } };
    case "request_item.needs_info":
      return { to: () => brandMembers(e.brandId), link: () => `/b/${e.brandSlug}/requests/${e.requestId}`, vars: { seq: e.itemSeq } };
    case "request_item.assigned":
      return { to: async () => [{ id: e.assigneeId, locale: "zh-CN" }], link: () => `/cn/items/${e.itemId}`, vars: {} };
    case "cn_question.created":
      return { to: admins, link: () => `/admin/requests/${e.requestId}`, vars: {} };
  }
}

export async function notify(e: NotifyEvent): Promise<void> {
  const r = route(e);
  const recipients = await r.to();
  if (!recipients.length) return;
  const kind = INSTANT.has(e.type) ? "instant" : "digest";
  await createAdminClient()
    .from("notifications")
    .insert(
      recipients.map((p) => ({
        recipient_id: p.id,
        kind,
        type: e.type,
        title: t(p.locale, `notify.${e.type}.title`, r.vars),
        link_path: r.link(p),
        channel: "inapp",
      })),
    );
}
