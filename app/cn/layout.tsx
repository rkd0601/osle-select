import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { unreadCount } from "@/lib/db/notifications";

/** 중국 소싱 영역. zh-CN 기본, 외부 의존(폰트·CDN·분석) 금지 (CLAUDE.md 규칙 9). */
export default async function CnLayout({ children }: { children: React.ReactNode }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
  const unread = await unreadCount();
  return (
    <div className="min-h-screen bg-paper" lang="zh-CN">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
          <Link href="/cn" className="text-[14px] font-bold">OSLE Select · {t(L, "cn.title")}</Link>
          <nav className="flex gap-4 text-[13px] text-paper/80">
            <Link href="/cn">{t(L, "cn.items")}</Link>
            <Link href="/cn/products">{t(L, "cn.products")}</Link>
            <Link href="/cn/products/new">{t(L, "cn.nav.new")}</Link>
            <Link href="/cn/tasks">{t(L, "cn.queue")}</Link>
            <Link href="/cn/notifications">{t(L, "notifications.title")}{unread > 0 ? ` ${unread}` : ""}</Link>
            <form action="/auth/signout" method="post"><button>{t(L, "common.signOut")}</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
