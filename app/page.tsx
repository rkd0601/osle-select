import Link from "next/link";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";

/** P-01 랜딩: 한 줄 + 소개 3블록(찾아서 · 확인하고 · 책임진다) + 신청. 카탈로그·도매몰이 아니라는 것을 먼저 말한다 */
export default function Landing() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-24">
      <div className="text-[12px] font-medium tracking-[0.18em] text-muted">{SERVICE.company} · {SERVICE.name.toUpperCase()}</div>
      <h1 className="mt-4 text-[40px] font-bold leading-[1.15] tracking-tight">수만 개 중에서 고르지 마세요.<br />당신 브랜드에 맞는 상품을 찾아서, 끝까지 책임지고 가져옵니다.</h1>
      <ol className="mt-14 grid gap-px border-y border-ink bg-line sm:grid-cols-3">
        {(["find", "verify", "own"] as const).map((k, i) => (
          <li key={k} className="bg-paper py-6 pr-6 sm:px-6 sm:first:pl-0">
            <span className="num text-[28px] font-semibold leading-none">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="mt-3 text-[16px] font-bold">{tk(`landing.${k}.title`)}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{tk(`landing.${k}.body`)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[12px] text-muted">{tk("landing.note")}</p>
      <div className="mt-10 flex gap-3">
        <Link href="/apply" className="rounded-[var(--radius)] bg-ink px-5 py-3 text-[14px] font-medium text-paper">브랜드 신청하기</Link>
        <Link href="/login" className="rounded-[var(--radius)] border border-line bg-surface px-5 py-3 text-[14px] font-medium">로그인</Link>
      </div>
    </main>
  );
}
