import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { DEV_ACCOUNTS, devQuickLoginEnabled } from "@/lib/auth/dev-login";
import { DevQuickLogin } from "./dev-quick-login";
import { Mark } from "@/components/domain/monogram";

export const metadata = { title: `로그인 · ${SERVICE.name}` };

const ERROR_KEYS: Record<string, string> = { "no-role": "login.error.noRole", "no-brand": "login.error.noBrand", auth: "login.error.generic", callback: "login.error.generic" };

/** P-02 로그인 (디자인 v2 §5): 왼쪽 ink 면(모노그램·클레임 40/300·3단계·바닥 한 문장) / 오른쪽 폼 360px. 960 미만은 위아래. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const errorKey = error ? ERROR_KEYS[error] : undefined;
  return (
    <main className="login min-h-screen">
      <section className="pane">
        <Link href="/"><Mark word={SERVICE.name.toUpperCase()} dark /></Link>
        <div>
          <p className="claim">{tk("login.claim.a")}<br /><b>{tk("login.claim.b1")}<br />{tk("login.claim.b2")}</b></p>
          <div className="steps mt-10">
            {[1, 2, 3].map((n) => (
              <div key={n}>
                <div className="k">{String(n).padStart(2, "0")}</div>
                <div className="t">{tk(`login.step.${n}.t`)}</div>
                <div className="d">{tk(`login.step.${n}.d`)}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="foot">{tk("login.foot")}</p>
      </section>
      <section className="form">
        <div className="box">
          {errorKey && <p role="alert" className="mb-6 bg-crit-soft px-4 py-3 text-body text-crit">{tk(errorKey)}</p>}
          <Suspense>
            <LoginForm />
          </Suspense>
          {devQuickLoginEnabled() && <DevQuickLogin accounts={[...DEV_ACCOUNTS]} />}
        </div>
      </section>
    </main>
  );
}
