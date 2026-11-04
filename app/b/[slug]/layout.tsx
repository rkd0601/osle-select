import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrandMember } from "@/lib/auth/session";
import { isValidSlug } from "@/lib/auth/access";
import { tk } from "@/lib/i18n";
import { SERVICE } from "@/lib/config";
import { unreadCount } from "@/lib/db/notifications";
import { NavLink } from "@/components/domain/nav-link";
import { Monogram } from "@/components/domain/monogram";

/**
 * 브랜드 영역 가드. slug ↔ 세션 멤버십을 DB(RLS)로 검증한다. 미존재·무권한 모두 404 (PRD D10, 6장).
 * 머리: 서비스 워드마크 · 브랜드명 · 지금 메뉴 표시(밑줄) · 알림 수 · 내 이름(역할). 모바일은 가로 스크롤 메뉴.
 */
export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const { user, brand, member } = await requireBrandMember(slug);
  const base = `/b/${brand.slug}`;
  const unread = await unreadCount();
  const nav = [
    ["requests", tk("nav.requests")],
    ["offers", tk("nav.offers")],
    ["samples", tk("nav.samples")],
    ["orders", tk("nav.orders")],
    ["exports", tk("nav.exports")],
    ["settings", tk("nav.settings")],
  ] as const;
  const name = user.displayName ?? user.email ?? "";
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
          <Link href={base} className="flex min-w-0 items-center gap-3">
            <Monogram size={30} />
            <span className="eyebrow hidden text-ink lg:inline">{SERVICE.name}</span>
            <span className="hidden h-4 w-px bg-line-strong lg:inline" aria-hidden />
            <span className="truncate text-h5 font-bold tracking-tight">{brand.name}</span>
            {member.onBehalf && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-caption font-semibold text-warn">관리자 대행</span>}
          </Link>
          <nav aria-label={tk("nav.menu")} className="hidden items-center gap-6 text-body md:flex">
            <NavLink href={base} exact>{tk("nav.home")}</NavLink>
            {nav.map(([p, label]) => <NavLink key={p} href={`${base}/${p}`}>{label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-2 text-meta">
            <Link href={`${base}/notifications`} className="relative rounded-full p-2 text-ink-2 hover:bg-paper hover:text-ink" aria-label={tk("notifications.title")}>
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12 5 8Z" strokeLinejoin="round" /><path d="M8.5 16.5a1.6 1.6 0 0 0 3 0" strokeLinecap="round" /></svg>
              {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-signature px-1 text-center text-micro leading-4 text-paper">{unread}</span>}
            </Link>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-caption font-semibold text-paper" aria-hidden>{name.slice(0, 1)}</span>
              <span className="leading-tight">
                <span className="block text-meta font-medium text-ink">{name}</span>
                <span className="block text-caption text-muted">{tk(`bsettings.${member.level}`)}{member.can_purchase && member.level !== "owner" ? ` · ${tk("nav.purchaseBadge")}` : ""}</span>
              </span>
            </div>
            <form action="/auth/signout" method="post"><button className="btn btn-ghost btn-sm">{tk("common.signOut")}</button></form>
          </div>
        </div>
        {/* 모바일: 상단 메뉴가 숨겨져 홈 카드 말고는 이동할 길이 없었다 (2026-11-04 UX 2차) */}
        <nav className="flex gap-5 overflow-x-auto px-5 pt-1 text-body md:hidden" aria-label={tk("nav.menu")}>
          <NavLink href={base} exact variant="tab">{tk("nav.home")}</NavLink>
          {nav.map(([p, label]) => <NavLink key={p} href={`${base}/${p}`} variant="tab">{label}</NavLink>)}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:py-10">{children}</main>
    </div>
  );
}
