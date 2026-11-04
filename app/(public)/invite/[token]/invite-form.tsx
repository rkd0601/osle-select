"use client";
import { useState, useTransition } from "react";
import { acceptInvite } from "./actions";
import { currentEmail, refreshMySession, sendLoginOtp, verifyLoginOtp } from "../../login/actions";
import { tk } from "@/lib/i18n";

type Step = "form" | "otp" | "accepting" | "done";

export function InviteAcceptForm({ token, email, slug }: { token: string; email: string; slug: string }) {
  const [step, setStep] = useState<Step>("form");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const finish = () =>
    start(async () => {
      setStep("accepting");
      const r = await acceptInvite({ token, displayName, phone, agreed: true });
      if (!r.ok) { setError(tk(r.error)); setStep("form"); return; }
      await refreshMySession(); // 새 JWT에 role 반영 (RLS)
      setStep("done");
      window.location.assign(`/b/${r.data.slug || slug}`);
    });

  const submitForm = () =>
    start(async () => {
      setError(null);
      if ((await currentEmail()) === email.toLowerCase()) return finish();
      const r = await sendLoginOtp(email);
      if (!r.ok) return setError(tk(r.error));
      setStep("otp");
    });

  const verify = () =>
    start(async () => {
      setError(null);
      const r = await verifyLoginOtp({ email, token: otp });
      if (!r.ok) return setError(tk(r.error));
      finish();
    });

  const input = "field";
  const btn = "btn lg w-full";

  if (step === "done") return <p className="text-lead text-signature">{tk("invite.done")}</p>;

  return (
    <div className="space-y-6">
      {step === "form" && (
        <>
          <label className="field">{tk("invite.name")}<input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <label className="field">{tk("invite.phone")}<input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
          <label className="field">{tk("login.email")}<input className={input} value={email} readOnly aria-readonly /></label>
          <label className="flex items-start gap-2 text-body text-ink-2"><input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />{tk("invite.agree")}</label>
          <button className={btn} onClick={submitForm} disabled={pending || !displayName || !agreed}>{tk("invite.accept")}</button>
        </>
      )}
      {step === "otp" && (
        <div className="space-y-4 bg-signature-soft px-4 py-4">
          <p className="text-meta text-signature">{tk("login.sent")}</p>
          <label className="field">{tk("login.otp.label")}
            <input className={`${input} num tracking-[0.3em]`} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button className={btn} onClick={verify} disabled={pending || otp.length !== 6}>{tk("login.otp.verify")}</button>
        </div>
      )}
      {step === "accepting" && <p className="text-body text-ink-2">…</p>}
      {error && <p role="alert" className="text-body text-crit">{error}</p>}
    </div>
  );
}
