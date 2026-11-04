"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEV_ACCOUNTS, devQuickLoginEnabled } from "@/lib/auth/dev-login";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * 개발용 빠른 로그인 — 로컬 `next dev`에서만. 시드 계정 목록 안의 이메일만, 비밀번호는 서버 환경변수(LOCAL_DEV_PASSWORD).
 * 운영 빌드(`next build`/`next start`, Vercel)에서는 NODE_ENV=production이라 항상 거부한다.
 */
export async function devQuickLogin(email: unknown): Promise<Result<{ next: string }>> {
  if (!devQuickLoginEnabled()) return { ok: false, error: "common.notFound" };
  const e = z.enum(DEV_ACCOUNTS.map((a) => a.email) as [string, ...string[]]).safeParse(email);
  if (!e.success) return { ok: false, error: "login.error.generic" };
  const { error } = await (await createClient()).auth.signInWithPassword({ email: e.data, password: process.env.LOCAL_DEV_PASSWORD! });
  return error ? { ok: false, error: "login.error.generic" } : { ok: true, data: { next: "/home" } };
}
