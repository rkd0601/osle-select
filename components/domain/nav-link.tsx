"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 메뉴 링크 (UI 키트) — 지금 보고 있는 메뉴를 표시한다(aria-current). exact면 경로가 같을 때만, 아니면 하위 경로까지.
 * 모양은 variant로: "top"(브랜드·중국 상단 메뉴 밑줄), "side"(관리자 사이드바), "tab"(모바일 가로 스크롤).
 */
export function NavLink({ href, children, exact = false, exclude = [], variant = "top" }: { href: string; children: React.ReactNode; exact?: boolean; exclude?: string[]; variant?: "top" | "side" | "tab" | "dark" }) {
  const path = usePathname();
  const on = !exclude.some((x) => path === x || path.startsWith(x + "/")) && (exact ? path === href : path === href || path.startsWith(href + "/"));
  const base = "shrink-0 whitespace-nowrap";
  const cls = {
    top: `relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-[17px] after:h-0.5 ${on ? "font-semibold text-ink after:bg-signature" : "text-ink-2 hover:text-ink after:bg-transparent"}`,
    tab: `shrink-0 whitespace-nowrap border-b-2 pb-2 ${on ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2"}`,
    side: `flex items-center justify-between rounded-ui px-3 py-2 transition-colors ${on ? "bg-paper/10 font-semibold text-paper shadow-[inset_2px_0_0_var(--gold)]" : "text-paper/65 hover:bg-paper/5 hover:text-paper"}`,
    dark: `relative py-1 transition-colors ${on ? "font-semibold text-paper after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-[var(--gold)]" : "text-paper/65 hover:text-paper"}`,
  }[variant];
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`${base} ${cls}`}>
      {children}
    </Link>
  );
}
