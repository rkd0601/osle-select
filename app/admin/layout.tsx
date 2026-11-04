import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { tk } from "@/lib/i18n/admin";
import { unreadCount } from "@/lib/db/notifications";
import { NavLink } from "@/components/domain/nav-link";
import { Monogram } from "@/components/domain/monogram";

/** 관리자 메뉴 — 일의 흐름대로 묶는다: 운영(대시보드) → 소싱(요청·검수·발행) → 거래(샘플·발주) → 관리 */
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
    <div className="flex min-h-screen bg-paper">
      <aside className="surface-dark sticky top-0 flex h-screen w-56 shrink-0 flex-col px-3 py-5">
        <Link href="/admin" className="flex items-center gap-3 px-3">
          <Monogram size={34} />
          <span>
            <span className="block text-micro font-semibold uppercase tracking-[var(--tracking-label)] text-paper/55">OSLE Select</span>
            <span className="block text-h5 font-semibold tracking-tight">{tk("admin.title")}</span>
          </span>
        </Link>
        <div className="gold-rule mx-3 mt-5" aria-hidden />
        <nav aria-label={tk("admin.nav.menu")} className="mt-5 flex-1 space-y-5 overflow-y-auto text-body">
          {GROUPS.map(([g, items]) => (
            <div key={g}>
              <div className="px-3 pb-1 text-micro font-semibold uppercase tracking-[var(--tracking-label)] text-paper/45">{tk(`admin.nav.group.${g}`)}</div>
              <div className="space-y-0.5">
                {items.map(([href, key]) => <NavLink key={href} href={href} exact={href === "/admin"} variant="side">{tk(key)}</NavLink>)}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-paper/15 pt-3">
          <NavLink href="/admin/notifications" variant="side">
            <span>{tk("notifications.title")}</span>
            {unread > 0 && <span className="num rounded-full bg-signature px-1.5 text-micro text-paper">{unread}</span>}
          </NavLink>
          <form action="/auth/signout" method="post" className="px-3 pt-1"><button className="text-meta text-paper/55 hover:text-paper">{tk("common.signOut")}</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8"><div className="mx-auto max-w-6xl">{children}</div></main>
    </div>
  );
}
