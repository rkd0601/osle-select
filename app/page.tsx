import Link from "next/link";
import { SERVICE } from "@/lib/config";

/** P-01 랜딩 골격. 소개 3블록 + 신청 폼은 9단계에서 채운다. */
export default function Landing() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-24">
      <div className="text-[12px] font-medium tracking-[0.18em] text-muted">{SERVICE.company} · {SERVICE.name.toUpperCase()}</div>
      <h1 className="mt-4 text-[40px] font-bold leading-[1.15] tracking-tight">수만 개 중에서 고르지 마세요.<br />당신 브랜드에 맞는 상품을 찾아서, 끝까지 책임지고 가져옵니다.</h1>
      <div className="mt-10 flex gap-3">
        <Link href="/apply" className="rounded-[var(--radius)] bg-ink px-5 py-3 text-[14px] font-medium text-paper">브랜드 신청하기</Link>
        <Link href="/login" className="rounded-[var(--radius)] border border-line bg-surface px-5 py-3 text-[14px] font-medium">로그인</Link>
      </div>
    </main>
  );
}
