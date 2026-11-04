"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 메뉴 링크 — 지금 보고 있는 메뉴 표시(aria-current). exact면 경로가 같을 때만, 아니면 하위 경로까지. exclude는 제외할 하위 경로.
 * variant(디자인 v2 §3): "top" 브랜드 바(1px 밑줄이 바 하단과 겹침) · "tab" 모바일 가로 메뉴 · "side" 관리자 사이드바(왼쪽 1px 금색 + 4% 흰 배경, 오른쪽 건수) · "dark" 중국 바(1px 금색 밑줄).
 */
export function NavLink({ href, children, exact = false, exclude = [], variant = "top", count }: {
  href: string; children: React.ReactNode; exact?: boolean; exclude?: string[]; variant?: "top" | "side" | "tab" | "dark"; count?: number | null;
}) {
  const path = usePathname();
  const on = !exclude.some((x) => path === x || path.startsWith(x + "/")) && (exact ? path === href : path === href || path.startsWith(href + "/"));
  const cls = {
    top: `flex h-full items-center border-b text-body ${on ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`,
    tab: `flex h-full items-center border-b ${on ? "border-ink text-ink" : "border-transparent text-ink-2"}`,
    side: `flex items-center justify-between border-l px-2 py-2 text-body ${on ? "border-gold bg-white/[0.04] text-paper" : "border-transparent text-paper/70 hover:text-paper"}`,
    dark: `flex h-full items-center border-b ${on ? "border-gold text-paper" : "border-transparent text-paper/70 hover:text-paper"}`,
  }[variant];
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`shrink-0 whitespace-nowrap transition-colors ${cls}`}>
      {children}
      {count != null && count > 0 && <span className={`num ml-2 text-caption ${variant === "side" || variant === "dark" ? "text-paper/60" : "text-muted"}`}>{count}</span>}
    </Link>
  );
}
