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
  ] as const;
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href={base} className="text-[14px] font-bold tracking-tight">
            <span className="text-muted">{SERVICE.name}</span> · {brand.name}
            {member.onBehalf && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">관리자 대행</span>}
          </Link>
          <nav className="hidden gap-5 text-[13px] text-ink-2 md:flex">
            {nav.map(([p, label]) => (
              <Link key={p} href={`${base}/${p}`} className="hover:text-ink">{label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <Link href={`${base}/notifications`} className="text-ink-2 hover:text-ink">{tk("notifications.title")}{unread > 0 && <span className="num ml-1 rounded-full bg-signature px-1.5 text-[10px] text-paper">{unread}</span>}</Link>
            <span>{user.displayName ?? user.email} <span className="text-muted/70">({member.level}{member.can_purchase && member.level !== "owner" ? " · 구매" : ""})</span></span>
            <form action="/auth/signout" method="post"><button className="underline-offset-4 hover:underline">{tk("common.signOut")}</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
