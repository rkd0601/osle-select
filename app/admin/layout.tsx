import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { tk } from "@/lib/i18n";
import { unreadCount } from "@/lib/db/notifications";

const NAV = [
  ["/admin", "admin.nav.dashboard"], ["/admin/requests", "admin.nav.requests"], ["/admin/products", "admin.nav.products"], ["/admin/offers", "admin.nav.offers"],
  ["/admin/samples", "admin.nav.samples"], ["/admin/orders", "admin.nav.orders"], ["/admin/brands", "admin.nav.brands"], ["/admin/vendors", "admin.nav.vendors"],
  ["/admin/settings", "admin.nav.settings"], ["/admin/glossary", "admin.nav.glossary"], ["/admin/audit", "admin.nav.audit"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"], "/admin");
  const unread = await unreadCount();
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="w-52 shrink-0 bg-ink px-3 py-5 text-paper">
        <div className="px-2 text-[13px] font-bold">OSLE Select · {tk("admin.title")}</div>
        <nav className="mt-4 space-y-0.5 text-[13px]">
          {NAV.map(([href, key]) => (
            <Link key={href} href={href} className="block rounded-[var(--radius)] px-2 py-1.5 text-paper/80 hover:bg-paper/10 hover:text-paper">{tk(key)}</Link>
          ))}
        </nav>
        <Link href="/admin/notifications" className="mt-4 block rounded-[var(--radius)] px-2 py-1.5 text-[13px] text-paper/80 hover:bg-paper/10">
          {tk("notifications.title")}{unread > 0 && <span className="num ml-1 rounded-full bg-signature px-1.5 text-[10px] text-paper">{unread}</span>}
        </Link>
        <form action="/auth/signout" method="post" className="mt-6 px-2"><button className="text-[12px] text-paper/60">{tk("common.signOut")}</button></form>
      </aside>
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
