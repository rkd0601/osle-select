"use client";
import { useState, useTransition } from "react";
import { tk } from "@/lib/i18n";
import { devQuickLogin } from "./dev-actions";

/** 개발용 빠른 로그인 — page.tsx가 devQuickLoginEnabled()일 때만 렌더(운영 빌드엔 없음). 룰 사이 행 목록 */
export function DevQuickLogin({ accounts }: { accounts: { email: string; labelKey: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (email: string) =>
    start(async () => {
      setError(null);
      setBusy(email);
      const r = await devQuickLogin(email);
      if (!r.ok) { setBusy(null); return setError(tk(r.error)); }
      window.location.assign(r.data.next);
    });
  return (
    <section aria-labelledby="dev-login" className="mt-14 border-t border-line pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="dev-login" className="text-meta text-ink">{tk("login.dev.title")}</h2>
        <span className="chip">DEV</span>
      </div>
      <p className="mt-1 text-caption text-muted">{tk("login.dev.help")}</p>
      <div className="mt-3">
        {accounts.map((a) => (
          <button key={a.email} type="button" disabled={pending} onClick={() => go(a.email)}
            className="flex w-full items-baseline justify-between gap-3 border-b border-line py-2.5 text-left transition-colors hover:text-signature disabled:opacity-50">
            <span className="truncate text-body">{busy === a.email ? "…" : ""}{tk(a.labelKey)}</span>
            <span className="num truncate text-caption text-muted">{a.email}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-body text-crit">{error}</p>}
    </section>
  );
}
