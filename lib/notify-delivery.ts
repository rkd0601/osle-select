import "server-only";
import { createElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { listUsersByRole } from "@/lib/db/users";
import { ROLES, SERVICE } from "@/lib/config";
import { t, type Locale } from "@/lib/i18n";
import { channelFor, groupDigest, type DigestRow } from "@/lib/digest";
import { sendEmail } from "@/lib/channels/email";
import { postWecom, wecomEscape } from "@/lib/channels/wecom";
import { NoticeEmail } from "@/emails/notice";

/**
 * 알림 발송 배치 (notify()가 만든 행 → 이메일·WeCom). 채널 결정은 lib/digest#channelFor 한 곳, 발송 결과는 행에 기록.
 * instant: 즉시(after) + 5분 배치 재시도(3회). digest: 1일 1회 수신자별 1통. 실패해도 상태 전이에는 영향 없다.
 */
const MAX_ATTEMPTS = 3;
const abs = (path: string | null) => (path ? `${SERVICE.domain}${path}` : SERVICE.domain);

type Recipient = { id: string; email: string | null; role: string; locale: Locale; name: string; wecomName: string | null; digest: boolean };
async function recipients(ids: string[]): Promise<Map<string, Recipient>> {
  if (!ids.length) return new Map();
  const [users, { data: profiles }] = await Promise.all([
    listUsersByRole(ROLES),
    createAdminClient().from("profiles").select("id, display_name, locale, wecom_name, notify_digest").in("id", ids),
  ]);
  const out = new Map<string, Recipient>();
  for (const p of profiles ?? []) {
    const u = users.find((x) => x.id === p.id);
    if (!u) continue;
    out.set(p.id, { id: p.id, email: u.email, role: u.role, locale: (p.locale as Locale) ?? "ko", name: p.display_name, wecomName: p.wecom_name, digest: p.notify_digest });
  }
  return out;
}

async function send(r: Recipient, heading: string, lines: { title: string; count: number; link_path: string | null }[]) {
  const ch = channelFor(r.role);
  if (ch === "wecom") {
    const who = wecomEscape(r.wecomName || r.name || "");
    const body = lines.map((l) => `> [${wecomEscape(l.title)}${l.count > 1 ? ` ×${l.count}` : ""}](${abs(l.link_path)})`).join("\n");
    return { ch, res: await postWecom(`**${who}** ${wecomEscape(heading)}\n${body}`) };
  }
  if (ch === "email" && r.email) {
    const react = createElement(NoticeEmail, { locale: r.locale, heading, lines: lines.map((l) => ({ title: l.title, count: l.count, href: abs(l.link_path) })), url: abs(lines[0]?.link_path ?? null) });
    return { ch, res: await sendEmail({ to: r.email, subject: heading, react }) };
  }
  return { ch, res: { ok: false as const, error: "no_channel", skipped: true } };
}

/** instant 미발송분 발송(재시도 포함). ids를 주면 그 행만(notify 직후) */
export async function deliverInstant(ids?: string[]) {
  const db = createAdminClient();
  // 선점 먼저: attempts를 올리며 가져온 행만 보낸다 — notify() 직후 after()와 5분 크론, 겹치는 크론이 같은 행을 두 번 보내지 않게 (r6 리뷰 2)
  let pick = db.from("notifications").select("id").eq("kind", "instant").is("email_sent_at", null).is("wecom_sent_at", null).lt("attempts", MAX_ATTEMPTS).limit(200);
  if (ids) pick = pick.in("id", ids);
  const { data: cand } = await pick;
  const rows: { id: string; recipient_id: string; title: string; link_path: string | null; attempts: number }[] = [];
  for (const c of cand ?? []) {
    // 행 단위 조건부 update = 선점. attempts가 그 사이 바뀌었으면(다른 워커가 잡음) 0행 → 건너뜀
    const { data: got } = await db.from("notifications").select("id, recipient_id, title, link_path, attempts").eq("id", c.id).is("email_sent_at", null).is("wecom_sent_at", null).lt("attempts", MAX_ATTEMPTS).maybeSingle();
    if (!got) continue;
    const { data: claimed } = await db.from("notifications").update({ attempts: got.attempts + 1 }).eq("id", c.id).eq("attempts", got.attempts).select("id").maybeSingle();
    if (claimed) rows.push({ ...got, attempts: got.attempts + 1 });
  }
  const map = await recipients([...new Set((rows ?? []).map((r) => r.recipient_id))]);
  let sent = 0;
  for (const row of rows ?? []) {
    const r = map.get(row.recipient_id);
    if (!r) continue;
    const { ch, res } = await send(r, row.title, [{ title: row.title, count: 1, link_path: row.link_path }]);
    const now = new Date().toISOString();
    if (res.ok) sent++;
    // 건너뜀(키 없음·채널 없음)은 재시도하지 않는다 — attempts를 끝까지 올린다
    const patch = res.ok
      ? (ch === "wecom" ? { wecom_sent_at: now } : { email_sent_at: now })
      : { attempts: "skipped" in res && res.skipped ? MAX_ATTEMPTS : row.attempts, delivery_error: res.error }; // attempts는 선점 때 이미 +1
    await db.from("notifications").update(patch).eq("id", row.id);
  }
  return { checked: rows?.length ?? 0, sent };
}

/** digest: 아직 묶이지 않은 행을 수신자별 1통으로 (수신 거부자는 묶음 처리만 하고 보내지 않음 — 인앱에는 남는다) */
export async function deliverDigests() {
  const db = createAdminClient();
  const { data: rows } = await db.from("notifications").select("id, recipient_id, type, title, link_path, entity, entity_id, created_at").eq("kind", "digest").is("digest_sent_at", null).limit(5000);
  const grouped = groupDigest((rows ?? []) as DigestRow[]);
  const map = await recipients([...grouped.keys()]);
  let sent = 0;
  for (const [rid, lines] of grouped) {
    const r = map.get(rid);
    const ids = lines.flatMap((l) => l.ids);
    let error: string | null = null;
    if (r?.digest) {
      const { res } = await send(r, t(r.locale, "email.digest.subject", { n: lines.length }), lines);
      if (res.ok) sent++;
      else if (!("skipped" in res && res.skipped)) error = res.error;
    }
    // 실패한 묶음은 digest_sent_at을 비워 둬 다음 배치에서 다시 묶인다(건너뜀·수신 거부는 처리 완료) (r6 리뷰 8)
    await db.from("notifications").update(error ? { delivery_error: error } : { digest_sent_at: new Date().toISOString(), delivery_error: null }).in("id", ids);
  }
  return { recipients: grouped.size, sent };
}
