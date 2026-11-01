import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { tk } from "@/lib/i18n";

const NAV = [
  ["/admin", "대시보드"], ["/admin/requests", "요청 접수·배정"], ["/admin/products", "상품 검수"], ["/admin/offers", "제안 발행·상품"],
  ["/admin/samples", "샘플 관리"], ["/admin/orders", "발주 관리"], ["/admin/brands", "브랜드 관리"], ["/admin/settings", "설정"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"], "/admin");
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="w-52 shrink-0 bg-ink px-3 py-5 text-paper">
        <div className="px-2 text-[13px] font-bold">OSLE Select · {tk("admin.title")}</div>
        <nav className="mt-4 space-y-0.5 text-[13px]">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-[var(--radius)] px-2 py-1.5 text-paper/80 hover:bg-paper/10 hover:text-paper">{label}</Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="mt-6 px-2"><button className="text-[12px] text-paper/60">{tk("common.signOut")}</button></form>
      </aside>
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
