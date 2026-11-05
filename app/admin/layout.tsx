import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { tk } from "@/lib/i18n/admin";
import { unreadCount } from "@/lib/db/notifications";
import { NavLink } from "@/components/domain/nav-link";
import { Mark } from "@/components/domain/monogram";

/** 관리자 메뉴 — 일의 흐름대로: 운영 → 소싱(요청·검수·발행) → 거래(샘플·발주) → 관리. 사이드바 232px ink(디자인 v2 §3) */
const GROUPS = [
  ["ops", [["/admin", "admin.nav.dashboard"]]],
  ["sourcing", [["/admin/requests", "admin.nav.requests"], ["/admin/products", "admin.nav.products"], ["/admin/offers", "admin.nav.offers"]]],
  ["deals", [["/admin/samples", "admin.nav.samples"], ["/admin/orders", "admin.nav.orders"]]],
  ["manage", [["/admin/brands", "admin.nav.brands"], ["/admin/vendors", "admin.nav.vendors"], ["/admin/settings", "admin.nav.settings"], ["/admin/glossary", "admin.nav.glossary"], ["/admin/audit", "admin.nav.audit"]]],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"], "/admin");
  const unread = await unreadCount();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col bg-ink px-5 py-7 text-paper">
        <Link href="/admin" className="block px-2 pb-6"><Mark word="OSLE SELECT" dark /></Link>
        <nav aria-label={tk("admin.nav.menu")} className="flex-1 overflow-y-auto">
          {GROUPS.map(([g, items]) => (
            <div key={g}>
              <div className="num px-2 pb-1.5 pt-4 text-[10px] uppercase tracking-[0.18em] text-paper/40">{tk(`admin.nav.group.${g}`)}</div>
              {items.map(([href, key]) => <NavLink key={href} href={href} exact={href === "/admin"} variant="side">{tk(key)}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-white/10 pt-4">
          <NavLink href="/admin/notifications" variant="side" count={unread}>{tk("notifications.title")}</NavLink>
          <form action="/auth/signout" method="post" className="px-2 pt-2"><button className="text-caption text-paper/55 hover:text-paper">{tk("common.signOut")}</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-12 pb-24 pt-10"><div className="cq mx-auto max-w-[1200px]">{children}</div></main>
    </div>
  );
}
