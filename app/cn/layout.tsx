import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { t } from "@/lib/i18n/cn";
import { unreadCount } from "@/lib/db/notifications";
import { NavLink } from "@/components/domain/nav-link";
import { Monogram } from "@/components/domain/monogram";

/** 중국 소싱 영역. zh-CN 기본, 외부 의존(폰트·CDN·분석) 금지 (CLAUDE.md 규칙 9). 모바일 우선(C-02 현장 등록). */
export default async function CnLayout({ children }: { children: React.ReactNode }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
  const unread = await unreadCount();
  const links = (
    <>
      <NavLink href="/cn" exact variant="dark">{t(L, "cn.items")}</NavLink>
      <NavLink href="/cn/products" variant="dark" exclude={["/cn/products/new"]}>{t(L, "cn.products")}</NavLink>
      <NavLink href="/cn/products/new" variant="dark">{t(L, "cn.nav.new")}</NavLink>
      <NavLink href="/cn/tasks" variant="dark">{t(L, "cn.queue")}</NavLink>
      <NavLink href="/cn/notifications" variant="dark">
        {t(L, "notifications.title")}{unread > 0 && <span className="num ml-1 rounded-full bg-signature px-1.5 text-micro text-paper">{unread}</span>}
      </NavLink>
    </>
  );
  return (
    <div className="min-h-screen bg-paper" lang="zh-CN">
      <header className="surface-dark sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/cn" className="flex shrink-0 items-center gap-2.5">
            <Monogram size={30} />
            <span>
              <span className="block text-micro font-semibold uppercase tracking-[var(--tracking-label)] text-paper/55">OSLE Select</span>
              <span className="block text-lead font-semibold leading-tight">{t(L, "cn.title")}</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-body md:flex">{links}</nav>
          <form action="/auth/signout" method="post"><button className="text-meta text-paper/60 hover:text-paper">{t(L, "common.signOut")}</button></form>
        </div>
        {/* 모바일: 가로 스크롤 메뉴 */}
        <nav className="flex gap-5 overflow-x-auto px-4 pb-2.5 text-body md:hidden">{links}</nav>
        <div className="light-rule" aria-hidden />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
