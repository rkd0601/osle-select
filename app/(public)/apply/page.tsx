import Link from "next/link";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { ApplyForm } from "./apply-form";
import { Mark } from "@/components/domain/monogram";

/** P-01 브랜드 신청 — 위아더가 검토 후 초대 메일을 보낸다 */
export default function ApplyPage() {
  return (
    <div className="site min-h-screen">
      <header className="bar"><div className="wrap"><Link href="/"><Mark word={SERVICE.name.toUpperCase()} /></Link></div></header>
      <main className="page wrap">
        <div className="two">
          <div>
            <div className="eyebrow">{SERVICE.company}</div>
            <h1 className="h1 mt-3">{tk("apply.title")}</h1>
            <p className="lead mt-3">{tk("apply.lead")}</p>
            <ol className="mt-10 border-t border-ink">
              {(["find", "verify", "own"] as const).map((k, i) => (
                <li key={k} className="grid grid-cols-[40px_1fr] gap-3 border-b border-line py-4">
                  <span className="num text-caption tracking-[0.14em] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-body text-ink-2"><b className="block text-ink">{tk(`landing.${k}.title`)}</b>{tk(`landing.${k}.body`)}</span>
                </li>
              ))}
            </ol>
          </div>
          <ApplyForm />
        </div>
      </main>
    </div>
  );
}
