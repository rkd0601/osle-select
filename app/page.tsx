import Link from "next/link";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { Monogram } from "@/components/domain/monogram";

/** P-01 랜딩: 한 줄 + 소개 3블록(찾아서 · 확인하고 · 책임진다) + 신청. 카탈로그·도매몰이 아니라는 것을 먼저 말한다 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="surface-dark relative overflow-hidden">
        <header className="relative">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <span className="flex items-center gap-2.5"><Monogram size={32} /><span className="eyebrow text-paper/80">{SERVICE.name}</span></span>
            <nav className="flex items-center gap-2">
              <Link href="/login" className="btn btn-sm text-paper/80 hover:text-paper">{tk("landing.cta.login")}</Link>
              <Link href="/apply" className="btn btn-sm bg-[#f5f5f3] text-ink hover:bg-white">{tk("landing.cta.apply")}</Link>
            </nav>
          </div>
        </header>
        {/* 간접조명 빛줄(장식) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="light-rule absolute left-0 top-[34%] w-full origin-left rotate-[6deg] opacity-30" />
          <span className="light-rule absolute bottom-[18%] left-0 w-full origin-left -rotate-[6deg] opacity-30" />
        </div>
        <section className="relative mx-auto grid max-w-6xl items-end gap-12 px-6 pb-24 pt-16 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:pb-28 md:pt-24">
          <div>
            <div className="eyebrow text-gold">{SERVICE.company} · {SERVICE.name}</div>
            <h1 className="mt-5 text-display font-semibold leading-[1.14] tracking-tight text-[#f5f5f3] lg:text-display-l">{tk("landing.h1a")}<br />{tk("landing.h1b")}</h1>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/apply" className="btn btn-lg bg-[#f5f5f3] text-ink hover:bg-white">{tk("landing.cta.apply")}</Link>
              <Link href="/login" className="btn btn-lg border border-paper/30 text-paper hover:border-paper">{tk("landing.cta.login")}</Link>
            </div>
          </div>
          {/* 3:4 실물컷 틀 — 사진 중심 서비스(D19). 실제 사진은 운영 데이터가 생기면 교체 */}
          <div aria-hidden className="relative hidden h-[420px] md:block">
            <span className="photo-ph absolute right-0 top-0 block aspect-[3/4] w-56 shadow-[var(--shadow-pop)]" />
            <span className="photo-ph absolute bottom-0 right-40 block aspect-[3/4] w-48 border-4 border-charcoal shadow-[var(--shadow-pop)]" />
            <span className="absolute right-4 top-4 border border-gold/60 bg-charcoal/85 px-2 py-1 text-micro font-semibold tracking-wide text-gold">{tk("linesheet.verified")}</span>
          </div>
        </section>
      </div>
      <main className="mx-auto max-w-6xl px-6 pt-12">
        <ol className="grid gap-px border-y border-ink bg-line sm:grid-cols-3">
          {(["find", "verify", "own"] as const).map((k, i) => (
            <li key={k} className="bg-paper py-8 pr-6 sm:px-8 sm:first:pl-0">
              <span className="num text-title-l font-medium leading-none text-gold">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="mt-4 text-h4 font-bold">{tk(`landing.${k}.title`)}</h2>
              <p className="mt-2 text-body leading-relaxed text-ink-2">{tk(`landing.${k}.body`)}</p>
            </li>
          ))}
        </ol>
        <p className="py-8 text-meta text-muted">{tk("landing.note")}</p>
      </main>
    </div>
  );
}
