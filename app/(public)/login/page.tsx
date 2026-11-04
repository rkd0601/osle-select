import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { DEV_ACCOUNTS, devQuickLoginEnabled } from "@/lib/auth/dev-login";
import { DevQuickLogin } from "./dev-quick-login";
import { Monogram } from "@/components/domain/monogram";

export const metadata = { title: `로그인 · ${SERVICE.name}` };

const ERROR_KEYS: Record<string, string> = { "no-role": "login.error.noRole", "no-brand": "login.error.noBrand", auth: "login.error.generic", callback: "login.error.generic" };

/** P-02 로그인. 왼쪽: 서비스가 무엇인지(랜딩 문구 재사용) · 오른쪽: 로그인 폼. 모바일은 폼만 먼저. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const errorKey = error ? ERROR_KEYS[error] : undefined;
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="surface-dark relative hidden flex-col justify-between overflow-hidden px-12 py-12 lg:flex">
        {/* 매장 복도의 간접조명처럼 — 가는 빛줄 두 개가 소실점으로 모인다(장식) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="light-rule absolute left-0 top-[38%] w-full origin-left rotate-[9deg] opacity-40" />
          <span className="light-rule absolute left-0 bottom-[30%] w-full origin-left -rotate-[9deg] opacity-40" />
        </div>
        <Link href="/" className="relative flex items-center gap-3">
          <Monogram size={44} />
          <span className="text-caption font-semibold uppercase tracking-[var(--tracking-label)] text-paper/70">{SERVICE.company} · {SERVICE.name}</span>
        </Link>
        <div className="relative">
          <h1 className="max-w-xl text-display font-semibold leading-[1.14] tracking-tight text-[#f5f5f3]">{tk("landing.h1a")}<br />{tk("landing.h1b")}</h1>
          <div className="gold-rule mt-10 max-w-xl" aria-hidden />
          <ol className="mt-6 grid max-w-xl grid-cols-3 gap-6">
            {(["find", "verify", "own"] as const).map((k, i) => (
              <li key={k}>
                <span className="num text-h3 font-medium text-gold">{String(i + 1).padStart(2, "0")}</span>
                <div className="mt-1.5 text-lead font-semibold text-[#f5f5f3]">{tk(`landing.${k}.title`)}</div>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative max-w-md text-meta text-paper/50">{tk("landing.note")}</p>
      </section>
      <section className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><Monogram size={30} tone="ink" /><span className="eyebrow text-ink">{SERVICE.name}</span></div>
          {errorKey && <p role="alert" className="mb-4 rounded-ui border border-crit/30 bg-crit-soft px-4 py-3 text-body text-crit">{tk(errorKey)}</p>}
          <div className="card card-pad sm:px-8 sm:py-8">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
          {devQuickLoginEnabled() && <DevQuickLogin accounts={[...DEV_ACCOUNTS]} />}
        </div>
      </section>
    </main>
  );
}
