import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { t } from "@/lib/i18n/cn";
import { unreadCount } from "@/lib/db/notifications";
import { NavLink } from "@/components/domain/nav-link";
import { Mark } from "@/components/domain/monogram";
import { SeenOnVisit } from "@/components/domain/seen-on-visit";

/** 중국 소싱 영역. zh-CN 기본, 외부 의존(폰트·CDN·분석) 금지 (CLAUDE.md 규칙 9). 헤더 56px ink + 가로 메뉴, 본문 최대 760(디자인 v2 §3). */
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
      <NavLink href="/cn/notifications" variant="dark" count={unread}>{t(L, "notifications.title")}</NavLink>
    </>
  );
  return (
    <div className="min-h-screen" lang="zh-CN">
      <header className="cnbar sticky top-0 z-20">
        <div className="wrap">
          <Link href="/cn" className="flex shrink-0 items-center gap-3">
            <Mark word="OSLE SELECT" dark />
            <span className="hidden border-l border-white/15 pl-3 text-body sm:inline">{t(L, "cn.title")}</span>
          </Link>
          <nav className="hidden h-full md:flex">{<div className="flex h-full gap-5">{links}</div>}</nav>
          <form action="/auth/signout" method="post" className="ml-auto md:ml-0"><button className="text-caption text-paper/60 hover:text-paper">{t(L, "common.signOut")}</button></form>
        </div>
      </header>
      <nav className="flex h-11 gap-5 overflow-x-auto border-b border-line bg-ink px-5 text-body text-paper md:hidden">{links}</nav>
      <SeenOnVisit />
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-8 md:pt-12">{children}</main>
    </div>
  );
}
