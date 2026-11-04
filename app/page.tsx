import Link from "next/link";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { Mark } from "@/components/domain/monogram";

/** P-01 랜딩 (디자인 v2): 한 줄 클레임(56/300) + 소개 3단(룰 사이) + 신청. 카탈로그·도매몰이 아니라는 것을 먼저 말한다 */
export default function Landing() {
  return (
    <div className="site min-h-screen">
      <header className="bar">
        <div className="wrap">
          <Mark word={SERVICE.name.toUpperCase()} />
          <div className="me ml-auto">
            <Link href="/login" className="link">{tk("landing.cta.login")}</Link>
            <Link href="/apply" className="btn sm">{tk("landing.cta.apply")}</Link>
          </div>
        </div>
      </header>
      <main className="page wrap">
        <section className="pb-16 pt-8 md:pb-24 md:pt-16">
          <div className="eyebrow">{SERVICE.company} · {SERVICE.name}</div>
          <h1 className="display-l mt-6 max-w-[16ch]">{tk("landing.h1a")}<br />{tk("landing.h1b")}</h1>
          <div className="mt-12 flex flex-wrap gap-3">
            <Link href="/apply" className="btn lg">{tk("landing.cta.apply")}</Link>
            <Link href="/login" className="btn lg sec">{tk("landing.cta.login")}</Link>
          </div>
        </section>
        <ol className="grid border-t border-ink sm:grid-cols-3 sm:gap-10">
          {(["find", "verify", "own"] as const).map((k, i) => (
            <li key={k} className="border-b border-line py-8 sm:border-b-0">
              <span className="num text-caption tracking-[0.14em] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="mt-3 text-lead">{tk(`landing.${k}.title`)}</h2>
              <p className="mt-2 text-body text-ink-2">{tk(`landing.${k}.body`)}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-caption text-muted">{tk("landing.note")}</p>
      </main>
    </div>
  );
}
