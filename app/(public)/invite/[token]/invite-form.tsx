"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { acceptInvite } from "./actions";
import { tk } from "@/lib/i18n";

type Step = "form" | "otp" | "accepting" | "done";

export function InviteAcceptForm({ token, email, slug }: { token: string; email: string; slug: string }) {
  const supabase = createClient();
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
      await supabase.auth.refreshSession(); // 새 JWT에 role 반영 (RLS)
      setStep("done");
      window.location.assign(`/b/${r.data.slug || slug}`);
    });

  const submitForm = () =>
    start(async () => {
      setError(null);
      const { data } = await supabase.auth.getUser();
      if (data.user?.email?.toLowerCase() === email.toLowerCase()) return finish();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) return setError(tk("login.error.generic"));
      setStep("otp");
    });

  const verify = () =>
    start(async () => {
      setError(null);
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
      if (error) return setError(tk("login.error.generic"));
      finish();
    });

  const input = "w-full rounded-[var(--radius)] border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-ink";
  const btn = "w-full rounded-[var(--radius)] bg-ink px-4 py-3 text-[14px] font-medium text-paper disabled:opacity-50";

  if (step === "done") return <p className="text-[14px] text-signature">{tk("invite.done")}</p>;

  return (
    <div className="space-y-4">
      {step === "form" && (
        <>
          <label className="block space-y-1.5 text-[13px] font-medium text-ink-2">{tk("invite.name")}<input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <label className="block space-y-1.5 text-[13px] font-medium text-ink-2">{tk("invite.phone")}<input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
          <label className="block space-y-1.5 text-[13px] font-medium text-ink-2">{tk("login.email")}<input className={`${input} text-muted`} value={email} readOnly /></label>
          <label className="flex items-start gap-2 text-[13px] text-ink-2"><input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />{tk("invite.agree")}</label>
          <button className={btn} onClick={submitForm} disabled={pending || !displayName || !agreed}>{tk("invite.accept")}</button>
        </>
      )}
      {step === "otp" && (
        <div className="space-y-3 rounded-[var(--radius)] border border-line bg-surface p-4">
          <div className="text-[13px] text-signature">{tk("login.sent")}</div>
          <label className="block space-y-1.5 text-[13px] font-medium text-ink-2">{tk("login.otp.label")}
            <input className={`${input} num tracking-[0.3em]`} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button className={btn} onClick={verify} disabled={pending || otp.length !== 6}>{tk("login.otp.verify")}</button>
        </div>
      )}
      {step === "accepting" && <p className="text-[13px] text-muted">…</p>}
      {error && <p role="alert" className="text-[13px] text-crit">{error}</p>}
    </div>
  );
}
