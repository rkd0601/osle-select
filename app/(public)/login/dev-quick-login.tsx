"use client";
import { useState, useTransition } from "react";
import { tk } from "@/lib/i18n";
import { devQuickLogin } from "./dev-actions";

/** 개발용 빠른 로그인 패널 — page.tsx가 devQuickLoginEnabled()일 때만 렌더한다 */
export function DevQuickLogin({ accounts }: { accounts: { email: string; labelKey: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (email: string) =>
    start(async () => {
      setError(null);
      const r = await devQuickLogin(email);
      if (!r.ok) return setError(tk(r.error));
      window.location.assign(r.data.next);
    });
  return (
    <section aria-labelledby="dev-login" className="mt-10 border-t border-line pt-6">
      <h2 id="dev-login" className="text-body font-medium text-ink">{tk("login.dev.title")}</h2>
      <p className="mt-1 text-xs text-muted">{tk("login.dev.help")}</p>
      <div className="mt-4 grid gap-2">
        {accounts.map((a) => (
          <button key={a.email} type="button" disabled={pending} onClick={() => go(a.email)}
            className="flex w-full items-baseline justify-between rounded-ui border border-line bg-surface px-4 py-3 text-left disabled:opacity-50">
            <span className="text-body font-medium text-ink">{tk(a.labelKey)}</span>
            <span className="text-xs text-muted">{a.email}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-body text-crit">{error}</p>}
    </section>
  );
}
