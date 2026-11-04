import Link from "next/link";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { ApplyForm } from "./apply-form";

/** P-01 브랜드 신청 — 위아더가 검토 후 초대 메일을 보낸다 */
export default function ApplyPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6"><Link href="/" className="eyebrow text-ink">{SERVICE.name}</Link></div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <div className="eyebrow">{SERVICE.company}</div>
          <h1 className="mt-2 text-title-l font-bold tracking-tight">{tk("apply.title")}</h1>
          <p className="mt-3 text-lead leading-relaxed text-ink-2">{tk("apply.lead")}</p>
          <ol className="mt-8 space-y-4 border-t border-line pt-6">
            {(["find", "verify", "own"] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="num text-h4 font-semibold text-signature">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-body text-ink-2"><b className="block text-ink">{tk(`landing.${k}.title`)}</b>{tk(`landing.${k}.body`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <ApplyForm />
      </main>
    </div>
  );
}
