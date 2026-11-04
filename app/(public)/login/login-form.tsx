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

  const btn = "btn lg w-full";
  const btnKakao = "btn lg w-full border-[#fae100] bg-[#fae100] text-[#191600] hover:border-[#f0d800] hover:bg-[#f0d800]"; // 카카오 버튼 가이드 색(디자인 v2 §5)

  return (
    <div>
      {mode === "brand" ? (
        <>
          <h1 className="h1">{brandName ? tk("login.brand.title", { brand: brandName }) : tk("login.title")}</h1>
          <p className="lead mt-2">{tk("login.brand.subtitle")}</p>
          <div className="field mt-9">
            <label htmlFor="login-email">{tk("login.email")}</label>
            <input id="login-email" type="email" autoComplete="email" placeholder={tk("login.emailPh")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={otpSent} />
          </div>
          {!otpSent ? (
            <button className={`${btn} mt-6`} onClick={sendOtp} disabled={pending || !email}>{tk("login.sendOtp")}</button>
          ) : (
            <div className="mt-6 space-y-4 bg-signature-soft px-4 py-4">
              <p className="text-meta text-signature">{tk("login.sent")}</p>
              <div className="field">
                <label htmlFor="login-otp">{tk("login.otp.label")}</label>
                <input id="login-otp" className="num tracking-[0.3em]" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
                <span className="hint">{tk("login.otp.help")}</span>
              </div>
              <button className={btn} onClick={verifyOtp} disabled={pending || otp.length !== 6}>{tk("login.otp.verify")}</button>
            </div>
          )}
          <div className="my-5 flex items-center gap-3 text-caption text-muted"><span className="h-px flex-1 bg-line" />{tk("login.or")}<span className="h-px flex-1 bg-line" /></div>
          <button className={btnKakao} onClick={kakao} disabled={pending}>{tk("login.kakao")}</button>
          <p className="mt-8 text-center"><button className="link" onClick={() => setMode("staff")}>{tk("login.staff")}</button></p>
        </>
      ) : (
        <>
          <h1 className="h1">{tk("login.staff")}</h1>
          <div className="field mt-9">
            <label htmlFor="staff-email">{tk("login.email")}</label>
            <input id="staff-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field mt-6">
            <label htmlFor="staff-pw">{tk("login.password")}</label>
            <input id="staff-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className={`${btn} mt-6`} onClick={staffLogin} disabled={pending || !email || !password}>{tk("login.submit")}</button>
          <p className="mt-8 text-center"><button className="link" onClick={() => setMode("brand")}>{tk("login.backToBrand")}</button></p>
        </>
      )}
      {error && <p role="alert" className="mt-4 text-body text-crit">{error}</p>}
    </div>
  );
}
