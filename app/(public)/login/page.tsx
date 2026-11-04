import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { DEV_ACCOUNTS, devQuickLoginEnabled } from "@/lib/auth/dev-login";
import { DevQuickLogin } from "./dev-quick-login";

export const metadata = { title: `로그인 · ${SERVICE.name}` };

const ERROR_KEYS: Record<string, string> = { "no-role": "login.error.noRole", "no-brand": "login.error.noBrand", auth: "login.error.generic", callback: "login.error.generic" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const errorKey = error ? ERROR_KEYS[error] : undefined;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <div className="text-xs font-medium tracking-[0.16em] text-muted">{SERVICE.name.toUpperCase()}</div>
      </div>
      {errorKey && <p role="alert" className="mb-4 rounded-ui border border-line bg-surface px-4 py-3 text-body text-crit">{tk(errorKey)}</p>}
      <Suspense>
        <LoginForm />
      </Suspense>
      {devQuickLoginEnabled() && <DevQuickLogin accounts={[...DEV_ACCOUNTS]} />}
    </main>
  );
}
