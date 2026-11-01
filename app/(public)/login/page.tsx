import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { SERVICE } from "@/lib/config";

export const metadata = { title: `로그인 · ${SERVICE.name}` };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <div className="text-xs font-medium tracking-[0.16em] text-muted">{SERVICE.name.toUpperCase()}</div>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
