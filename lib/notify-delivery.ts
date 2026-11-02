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
import { BUNDLE_MS, digestDue, shouldBundle, wecomUrlFor } from "@/lib/notify-rules";
import { notify } from "@/lib/notify";

/**
 * 알림 발송 배치 (notify()가 만든 행 → 이메일·WeCom). 채널 결정은 lib/digest#channelFor 한 곳, 발송 결과는 행에 기록.
 * instant: 즉시(after) + 5분 배치 재시도(3회). digest: 1일 1회 수신자별 1통. 실패해도 상태 전이에는 영향 없다.
 */
const MAX_ATTEMPTS = 3;
const LEASE_MS = 2 * 60_000; // 선점한 워커가 보내는 동안 다른 워커가 같은 행을 다시 잡지 않는다 (리뷰 LOW-4)
const abs = (path: string | null) => (path ? `${SERVICE.domain}${path}` : SERVICE.domain);

type Recipient = { id: string; email: string | null; role: string; locale: Locale; name: string; wecomName: string | null; digest: boolean; vendorWebhook: string | null };
// Route Handler(크론)에서는 React cache가 요청 단위로 묶이지 않는다 → 사용자 목록은 모듈 캐시 60초 (r6 리뷰 LOW)
let usersCache: { at: number; users: Awaited<ReturnType<typeof listUsersByRole>> } | null = null;
async function allUsers() {
  if (!usersCache || Date.now() - usersCache.at > 60_000) usersCache = { at: Date.now(), users: await listUsersByRole(ROLES) };
  return usersCache.users;
}
async function recipients(ids: string[]): Promise<Map<string, Recipient>> {
  if (!ids.length) return new Map();
  const [users, { data: profiles }] = await Promise.all([
    allUsers(),
    createAdminClient().from("profiles").select("id, display_name, locale, wecom_name, notify_digest").in("id", ids),
  ]);
  const out = new Map<string, Recipient>();
  for (const p of profiles ?? []) {
    const u = users.find((x) => x.id === p.id);
    if (!u) continue;
    out.set(p.id, { id: p.id, email: u.email, role: u.role, locale: (p.locale as Locale) ?? "ko", name: p.display_name, wecomName: p.wecom_name, digest: p.notify_digest, vendorWebhook: null });
  }
  // 원청 계정(CN_VENDOR)은 자기 원청 웹훅으로 (DECISIONS r6-4) — vendors.owner_profile_id → vendor_channels(서비스 롤만)
  const vendorAccounts = [...out.values()].filter((r) => r.role === "CN_VENDOR").map((r) => r.id);
  if (vendorAccounts.length) {
    const db = createAdminClient();
    const { data: vs } = await db.from("vendors").select("id, owner_profile_id").in("owner_profile_id", vendorAccounts);
    const { data: chs } = vs?.length ? await db.from("vendor_channels").select("vendor_id, wecom_webhook").in("vendor_id", vs.map((v) => v.id)) : { data: [] };
    for (const v of vs ?? []) {
      const r = v.owner_profile_id ? out.get(v.owner_profile_id) : undefined;
      if (r) r.vendorWebhook = (chs ?? []).find((c) => c.vendor_id === v.id)?.wecom_webhook ?? null;
    }
  }
  return out;
}

/** 브랜드 멤버인데 속한 브랜드가 전부 정지(active 아님)인 사람 — digest를 보내지 않는다 (DECISIONS r7-12). CN·ADMIN은 해당 없음 */
async function suspendedOnly(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await createAdminClient().from("brand_members").select("profile_id, brands(status)").in("profile_id", ids);
  const active = new Map<string, boolean>();
  for (const m of data ?? []) {
    const st = ((Array.isArray(m.brands) ? m.brands[0] : m.brands) as { status?: string } | null)?.status;
    active.set(m.profile_id, (active.get(m.profile_id) ?? false) || st === "active");
  }
  return new Set([...active].filter(([, a]) => !a).map(([id]) => id));
}

async function send(r: Recipient, heading: string, lines: { title: string; count: number; link_path: string | null }[]) {
  const ch = channelFor(r.role);
  if (ch === "wecom") {
    const who = wecomEscape(r.wecomName || r.name || "");
    const body = lines.map((l) => `> [${wecomEscape(l.title)}${l.count > 1 ? ` ×${l.count}` : ""}](${abs(l.link_path)})`).join("\n");
    return { ch, res: await postWecom(`**${who}** ${wecomEscape(heading)}\n${body}`, wecomUrlFor(r.role, r.vendorWebhook, process.env.WECOM_WEBHOOK_URL)) };
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
  const leaseCut = new Date(Date.now() - LEASE_MS).toISOString();
  const free = `delivery_claimed_at.is.null,delivery_claimed_at.lt.${leaseCut}`;
  let pick = db.from("notifications").select("id").eq("kind", "instant").is("email_sent_at", null).is("wecom_sent_at", null).lt("attempts", MAX_ATTEMPTS).or(free).limit(200);
  if (ids) pick = pick.in("id", ids);
  const { data: cand } = await pick;
  const rows: { id: string; recipient_id: string; title: string; link_path: string | null; attempts: number }[] = [];
  let bundled = 0;
  for (const c of cand ?? []) {
    // 행 단위 조건부 update = 선점. attempts가 그 사이 바뀌었으면(다른 워커가 잡음) 0행 → 건너뜀
    const { data: got } = await db.from("notifications").select("id, recipient_id, type, entity_id, created_at, title, link_path, attempts").eq("id", c.id).is("email_sent_at", null).is("wecom_sent_at", null).lt("attempts", MAX_ATTEMPTS).or(free).maybeSingle();
    if (!got) continue;
    const { data: claimed } = await db.from("notifications").update({ attempts: got.attempts + 1, delivery_claimed_at: new Date().toISOString() }).eq("id", c.id).eq("attempts", got.attempts).select("id").maybeSingle();
    if (!claimed) continue;
    // 같은 수신자·같은 대상에 10분 안에 실제 발송된(또는 보낼 차례인) 앞선 코멘트 알림이 있으면 외부 발송 없이 닫는다 — 인앱 행은 남는다 (8-9 · r8-8)
    if (got.type === "comment.added" && got.entity_id) {
      const since = new Date(new Date(got.created_at).getTime() - BUNDLE_MS).toISOString();
      const { data: prior } = await db.from("notifications").select("created_at, email_sent_at, wecom_sent_at, delivery_error, attempts").eq("recipient_id", got.recipient_id).eq("type", "comment.added").eq("entity_id", got.entity_id)
        .neq("id", got.id).gte("created_at", since).lte("created_at", got.created_at).limit(50);
      const priors = (prior ?? []).map((x) => ({
        created_at: x.created_at as string,
        sent: !!(x.email_sent_at || x.wecom_sent_at),
        bundled: x.delivery_error === "bundled",
        pending: !x.email_sent_at && !x.wecom_sent_at && (x.attempts ?? 0) < MAX_ATTEMPTS,
      }));
      if (shouldBundle(got.created_at, priors)) {
        await db.from("notifications").update({ attempts: MAX_ATTEMPTS, delivery_error: "bundled", delivery_claimed_at: null }).eq("id", got.id);
        bundled++;
        continue;
      }
    }
    rows.push({ ...got, attempts: got.attempts + 1 });
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
      : { attempts: "skipped" in res && res.skipped ? MAX_ATTEMPTS : row.attempts, delivery_error: res.error, delivery_claimed_at: null }; // attempts는 선점 때 이미 +1, 실패면 임대 해제 → 다음 배치 재시도
    await db.from("notifications").update(patch).eq("id", row.id);
    // 3회 모두 실패(건너뜀 아님) → 위아더가 인앱으로 알게 한다. digest 등급이라 실패 알림이 다시 즉시 발송되며 맴돌지 않는다
    if (!res.ok && !("skipped" in res && res.skipped) && row.attempts >= MAX_ATTEMPTS) await notify({ type: "notify.delivery_failed", notificationId: row.id });
  }
  return { checked: rows?.length ?? 0, sent, bundled };
}

/** digest: 아직 묶이지 않은 행을 수신자별 1통으로 (수신 거부자는 묶음 처리만 하고 보내지 않음 — 인앱에는 남는다) */
export async function deliverDigests(now = new Date()) {
  const db = createAdminClient();
  // 실패 묶음은 3회까지만 재시도, 오래된 것부터 (리뷰 LOW-6: 계속 튕기는 수신자가 다른 수신자 몫을 밀어내지 않게)
  const { data: rows } = await db.from("notifications").select("id, recipient_id, type, title, link_path, entity, entity_id, created_at, attempts").eq("kind", "digest").is("digest_sent_at", null).lt("attempts", MAX_ATTEMPTS).order("created_at").limit(5000);
  const grouped = groupDigest((rows ?? []) as DigestRow[]);
  const [map, suspended] = await Promise.all([recipients([...grouped.keys()]), suspendedOnly([...grouped.keys()])]);
  let sent = 0;
  for (const [rid, lines] of grouped) {
    const r = map.get(rid);
    const ids = lines.flatMap((l) => l.ids);
    if (r && !digestDue(r.locale, now.getUTCHours())) continue; // CN은 01 UTC(09:00 CST) 실행에서 — 묶지 않고 남겨 둔다 (DECISIONS r6-5)
    let error: string | null = null;
    if (r?.digest && !suspended.has(rid)) {
      const { res } = await send(r, t(r.locale, "email.digest.subject", { n: lines.length }), lines);
      if (res.ok) sent++;
      else if (!("skipped" in res && res.skipped)) error = res.error;
    }
    // 실패한 묶음은 digest_sent_at을 비워 둬 다음 배치에서 다시 묶인다(건너뜀·수신 거부는 처리 완료) (r6 리뷰 8)
    const tries = Math.max(0, ...(rows ?? []).filter((x) => ids.includes(x.id)).map((x) => x.attempts ?? 0)) + 1;
    await db.from("notifications").update(error ? { delivery_error: error, attempts: tries } : { digest_sent_at: new Date().toISOString(), delivery_error: null }).in("id", ids);
  }
  return { recipients: grouped.size, sent };
}
