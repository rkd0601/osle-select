import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrandMember } from "@/lib/auth/session";
import { isValidSlug } from "@/lib/auth/access";
import { tk } from "@/lib/i18n";
import { SERVICE } from "@/lib/config";
import { unreadCount } from "@/lib/db/notifications";

/**
 * 브랜드 영역 가드. slug ↔ 세션 멤버십을 DB(RLS)로 검증한다. 미존재·무권한 모두 404 (PRD D10, 6장).
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
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href={base} className="text-lead font-bold tracking-tight">
            <span className="text-muted">{SERVICE.name}</span> · {brand.name}
            {member.onBehalf && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">관리자 대행</span>}
          </Link>
          <nav className="hidden gap-5 text-body text-ink-2 md:flex">
            {nav.map(([p, label]) => (
              <Link key={p} href={`${base}/${p}`} className="hover:text-ink">{label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-meta text-muted">
            <Link href={`${base}/notifications`} className="text-ink-2 hover:text-ink">{tk("notifications.title")}{unread > 0 && <span className="num ml-1 rounded-full bg-signature px-1.5 text-micro text-paper">{unread}</span>}</Link>
            <span>{user.displayName ?? user.email} <span className="text-muted/70">({tk(`bsettings.${member.level}`)}{member.can_purchase && member.level !== "owner" ? ` · ${tk("nav.purchaseBadge")}` : ""})</span></span>
            <form action="/auth/signout" method="post"><button className="underline-offset-4 hover:underline">{tk("common.signOut")}</button></form>
          </div>
        </div>
        {/* 모바일: 상단 메뉴가 숨겨져 홈 카드 말고는 이동할 길이 없었다 (2026-11-04 UX 2차) */}
        <nav className="flex gap-4 overflow-x-auto px-5 pb-2 text-body text-ink-2 md:hidden" aria-label={tk("nav.requests")}>
          {nav.map(([p, label]) => (
            <Link key={p} href={`${base}/${p}`} className="shrink-0 whitespace-nowrap hover:text-ink">{label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
