import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrandMember } from "@/lib/auth/session";
import { isValidSlug } from "@/lib/auth/access";
import { tk } from "@/lib/i18n";
import { SERVICE } from "@/lib/config";
import { unreadCount } from "@/lib/db/notifications";
import { NavLink } from "@/components/domain/nav-link";
import { Mark } from "@/components/domain/monogram";

/**
 * 브랜드 영역 가드. slug ↔ 세션 멤버십을 DB(RLS)로 검증한다. 미존재·무권한 모두 404 (PRD D10, 6장).
 * 상단 바(디자인 v2 §3): 모노그램 + 워드마크 + 브랜드명(왼쪽 1px 룰) · 오른쪽 메뉴(활성 1px 밑줄) · 알림 아이콘+건수 · 이름 + 역할. 640 미만은 바 아래 가로 메뉴.
 */
export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const { user, brand, member } = await requireBrandMember(slug);
  const base = `/b/${brand.slug}`;
  const unread = await unreadCount();
  // 메뉴 넷(DECISIONS d-6): 홈 · 진행 · 청구 · 설정. 요청·제안·샘플·발주 상세는 "진행" 아래로 본다(exclude 없이 하위 경로 활성은 진행에 묶는다)
  const nav = [
    ["progress", tk("nav.progress")],
    ["billing", tk("nav.billing")],
    ["settings", tk("nav.settings")],
  ] as const;
  const under = (p: string) => (p === "progress" ? ["requests", "offers", "samples", "orders"].map((x) => `${base}/${x}`) : p === "billing" ? [`${base}/exports`] : p === "settings" ? [`${base}/help`] : []);
  const name = user.displayName ?? user.email ?? "";
  return (
    <div className="site min-h-screen">
      <header className="bar sticky top-0 z-20">
        <div className="wrap">
          <Link href={base} className="flex items-center"><Mark word={SERVICE.name.toUpperCase()} /></Link>
          <span className="brand">{brand.name}</span>
          {member.onBehalf && <span className="chip gold">관리자 대행</span>}
          <nav aria-label={tk("nav.menu")} className="nav">
            <NavLink href={base} exact>{tk("nav.home")}</NavLink>
            {nav.map(([p, label]) => <NavLink key={p} href={`${base}/${p}`} also={under(p)}>{label}</NavLink>)}
          </nav>
          <div className="me">
            <Link href={`${base}/notifications`} className="bell" aria-label={tk("notifications.title")}>
              <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M4 12V8a5 5 0 0 1 10 0v4l1.5 2h-13z" /><path d="M7.5 15.5a1.5 1.5 0 0 0 3 0" /></svg>
              {unread > 0 && <i>{unread}</i>}
            </Link>
            <span className="name">{name} <span className="label">{tk(`bsettings.${member.level}`)}{member.can_purchase && member.level !== "owner" ? ` · ${tk("nav.purchaseBadge")}` : ""}</span></span>
            <form action="/auth/signout" method="post"><button className="link">{tk("common.signOut")}</button></form>
          </div>
        </div>
      </header>
      <nav className="subnav" aria-label={tk("nav.menu")}>
        <NavLink href={base} exact variant="tab">{tk("nav.home")}</NavLink>
        {nav.map(([p, label]) => <NavLink key={p} href={`${base}/${p}`} also={under(p)} variant="tab">{label}</NavLink>)}
      </nav>
      <main className="page wrap">{children}</main>
    </div>
  );
}
