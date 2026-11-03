"use client";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { tk } from "@/lib/i18n";
import { safeNext } from "@/lib/auth/access";
import { kakaoLoginUrl, sendLoginOtp, staffLogin as staffLoginAction, verifyLoginOtp } from "./actions";

type Mode = "brand" | "staff";

/**
 * P-02 로그인. 브랜드: 이메일 OTP(6자리) 또는 카카오. 위아더·중국 담당자: 이메일+비밀번호.
 * 고정 PIN 없음(PRD D10). OTP 시도 제한은 Supabase Auth 설정(rate limit)으로. 인증 호출은 서버 액션(./actions, DECISIONS 11-3).
 */
export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const brandName = params.get("brand");
  const [mode, setMode] = useState<Mode>("brand");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sendOtp = () =>
    start(async () => {
      setError(null);
      const r = await sendLoginOtp(email);
      if (!r.ok) return setError(tk(r.error));
      setOtpSent(true);
    });

  const verifyOtp = () =>
    start(async () => {
      setError(null);
      const r = await verifyLoginOtp({ email, token: otp, next });
      if (!r.ok) return setError(tk(r.error));
      window.location.assign(r.data.next);
    });

  const kakao = () =>
    start(async () => {
      setError(null);
      const r = await kakaoLoginUrl(next);
      if (!r.ok) return setError(tk(r.error));
      window.location.assign(r.data.url);
    });

  const staffLogin = () =>
    start(async () => {
      setError(null);
      const r = await staffLoginAction({ email, password });
      if (!r.ok) return setError(tk(r.error));
      window.location.assign(r.data.next);
    });

  const input = "w-full rounded-ui border border-line bg-surface px-3 py-2.5 text-strong outline-none focus:border-ink";
  const btn = "w-full rounded-ui bg-ink px-4 py-3 text-lead font-medium text-paper disabled:opacity-50";
  const btnGhost = "w-full rounded-ui border border-line bg-surface px-4 py-3 text-lead font-medium text-ink disabled:opacity-50";

  return (
    <div className="space-y-6">
      {mode === "brand" ? (
        <>
          <div>
            <h1 className="text-h1-s font-bold leading-tight">{brandName ? tk("login.brand.title", { brand: brandName }) : tk("login.title")}</h1>
            <p className="mt-1 text-body text-ink-2">{tk("login.brand.subtitle")}</p>
          </div>
          <label className="block space-y-1.5 text-body font-medium text-ink-2">
            {tk("login.email")}
            <input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={otpSent} />
          </label>
          {!otpSent ? (
            <button className={btn} onClick={sendOtp} disabled={pending || !email}>{tk("login.sendOtp")}</button>
          ) : (
            <div className="space-y-3 rounded-ui border border-line bg-surface p-4">
              <div className="text-body text-signature">{tk("login.sent")}</div>
              <label className="block space-y-1.5 text-body font-medium text-ink-2">
                {tk("login.otp.label")}
                <input className={`${input} num tracking-[0.3em]`} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              </label>
              <div className="text-caption text-muted">{tk("login.otp.help")}</div>
              <button className={btn} onClick={verifyOtp} disabled={pending || otp.length !== 6}>{tk("login.otp.verify")}</button>
            </div>
          )}
          <div className="flex items-center gap-3 text-caption text-muted"><span className="rule flex-1" />{tk("login.or")}<span className="rule flex-1" /></div>
          <button className={btnGhost} onClick={kakao} disabled={pending}>{tk("login.kakao")}</button>
          <button className="w-full text-center text-meta text-muted underline-offset-4 hover:underline" onClick={() => setMode("staff")}>{tk("login.staff")}</button>
        </>
      ) : (
        <>
          <h1 className="text-h1-s font-bold leading-tight">{tk("login.staff")}</h1>
          <label className="block space-y-1.5 text-body font-medium text-ink-2">
            {tk("login.email")}
            <input className={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-body font-medium text-ink-2">
            {tk("login.password")}
            <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className={btn} onClick={staffLogin} disabled={pending || !email || !password}>{tk("login.submit")}</button>
          <button className="w-full text-center text-meta text-muted underline-offset-4 hover:underline" onClick={() => setMode("brand")}>← {tk("login.title")}</button>
        </>
      )}
      {error && <p role="alert" className="text-body text-crit">{error}</p>}
    </div>
  );
}
