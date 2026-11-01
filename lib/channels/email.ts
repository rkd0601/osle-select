import "server-only";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { SERVICE } from "@/lib/config";

/**
 * 이메일 채널 (Resend). notify 배치(lib/notify-delivery.ts)만 부른다 — 화면·액션에서 직접 쓰지 않는다(CLAUDE.md 코딩 규칙).
 * 키가 없으면(로컬·미설정) 건너뛰고 skipped로 돌려준다 — 인앱 알림은 이미 있다.
 */
export async function sendEmail(args: { to: string; subject: string; react: ReactElement }): Promise<{ ok: true } | { ok: false; error: string; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "no_api_key", skipped: true };
  try {
    const { error } = await new Resend(key).emails.send({ from: SERVICE.mailFrom, to: args.to, subject: args.subject, react: args.react });
    return error ? { ok: false, error: error.message.slice(0, 300) } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}
