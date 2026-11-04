"use client";
import { useState, useTransition } from "react";
import { tk } from "@/lib/i18n";
import { devQuickLogin } from "./dev-actions";

/** 개발용 빠른 로그인 패널 — page.tsx가 devQuickLoginEnabled()일 때만 렌더한다 */
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
    <section aria-labelledby="dev-login" className="mt-8 rounded-ui border border-dashed border-line-strong p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-warn-soft px-2 py-0.5 text-caption font-semibold text-warn">DEV</span>
        <h2 id="dev-login" className="text-body font-semibold text-ink">{tk("login.dev.title")}</h2>
      </div>
      <p className="mt-1 text-caption text-muted">{tk("login.dev.help")}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => {
          const label = tk(a.labelKey);
          return (
            <button key={a.email} type="button" disabled={pending} onClick={() => go(a.email)}
              className="group flex items-center gap-3 rounded-ui border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-ink disabled:opacity-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand text-caption font-semibold text-ink group-hover:bg-ink group-hover:text-paper" aria-hidden>
                {busy === a.email ? "…" : label.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-meta font-semibold text-ink">{label}</span>
                <span className="block truncate text-caption text-muted">{a.email}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-body text-crit">{error}</p>}
    </section>
  );
}
