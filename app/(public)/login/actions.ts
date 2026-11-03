"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/access";
import { SERVICE } from "@/lib/config";

/**
 * P-02 로그인·초대 수락의 인증 호출을 서버 액션으로 (DECISIONS 11-3). 브라우저에 Supabase 클라이언트를 싣지 않는다 —
 * 세션 쿠키는 서버 클라이언트(`lib/supabase/server`)가 응답에 쓴다. 실패 사유는 구분하지 않는다(계정 존재 여부 비노출).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const GENERIC = { ok: false as const, error: "login.error.generic" };
const Email = z.string().trim().toLowerCase().email().max(120);

export async function sendLoginOtp(email: unknown): Promise<Result<null>> {
  const e = Email.safeParse(email);
  if (!e.success) return GENERIC;
  const { error } = await (await createClient()).auth.signInWithOtp({ email: e.data, options: { shouldCreateUser: false } });
  return error ? GENERIC : { ok: true, data: null };
}

const Otp = z.object({ email: Email, token: z.string().regex(/^\d{6}$/), next: z.string().max(500).nullish() });
/** OTP 확인 → 세션 쿠키. 돌아갈 주소는 서버가 다시 거른다(open redirect 방지) */
export async function verifyLoginOtp(input: unknown): Promise<Result<{ next: string }>> {
  const p = Otp.safeParse(input);
  if (!p.success) return GENERIC;
  const { error } = await (await createClient()).auth.verifyOtp({ email: p.data.email, token: p.data.token, type: "email" });
  return error ? GENERIC : { ok: true, data: { next: safeNext(p.data.next) } };
}

const Staff = z.object({ email: Email, password: z.string().min(1).max(200) });
export async function staffLogin(input: unknown): Promise<Result<{ next: string }>> {
  const p = Staff.safeParse(input);
  if (!p.success) return GENERIC;
  const { error } = await (await createClient()).auth.signInWithPassword(p.data);
  return error ? GENERIC : { ok: true, data: { next: "/home" } };
}

/** 카카오: PKCE code verifier를 서버 쿠키에 두고 공급자 주소만 돌려준다. 콜백은 app/auth/callback */
export async function kakaoLoginUrl(next: unknown): Promise<Result<{ url: string }>> {
  const n = safeNext(typeof next === "string" ? next : null);
  const origin = (await headers()).get("origin") ?? SERVICE.domain;
  const { data, error } = await (await createClient()).auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(n)}`, skipBrowserRedirect: true },
  });
  return error || !data.url ? GENERIC : { ok: true, data: { url: data.url } };
}

/** 초대 수락 전: 지금 로그인한 이메일(없으면 null) */
export async function currentEmail(): Promise<string | null> {
  const { data } = await (await createClient()).auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

/** 초대 수락 뒤 새 JWT(app_metadata.role)를 쿠키에 반영 — RLS가 새 역할로 동작하도록 */
export async function refreshMySession(): Promise<Result<null>> {
  const { error } = await (await createClient()).auth.refreshSession();
  return error ? GENERIC : { ok: true, data: null };
}
