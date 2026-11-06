import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { loadBrandSettings } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { fmtDay } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { AddressForm, DigestToggle, InviteMemberForm, MemberRow, SlugForm } from "./settings-forms";

/**
 * B-10 브랜드 설정 (PRD 5장): 멤버·발주 권한(owner만), 기본 배송지, 내 알림(digest만 끌 수 있음 — DECISIONS r6-2), 주소 변경 요청(9-8).
 * 디자인 v2.2: 12칸 — 머리 8 → 잉크 룰 → 본문 8. 섹션은 1px 룰 사이(상자·상태 점 없음), 입력은 밑줄, 날짜 "11월 18일". 버튼은 화면에서도 숨기지만 서버 액션이 owner·본인 여부를 다시 확인한다.
 */
export default async function BrandSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, brand, member } = await requireBrandMember(slug);
  const s = await loadBrandSettings(brand.id, user.id);
  const dir = await memberDirectory(s.members.map((m) => m.profileId));
  const isOwner = member.level === "owner";
  return (
    <div className="g12">
      <div className="c8"><h1 className="h1">{tk("bsettings.title")}</h1></div>
      <div className="c4 tr"><Link href={`/b/${brand.slug}/help`} className="link">{tk("bsettings.help")}</Link></div>
      <div className="c12 rule-ink" />
      <div className="c8 min-w-0">
      <section>
        <div className="section-h">
          <h2>{tk("bsettings.members")}<span className="count">{s.members.length}</span></h2>
          {!isOwner && <span className="text-caption text-muted">{tk("bsettings.ownerOnly")}</span>}
        </div>
        <ul>
          {s.members.map((m) => <MemberRow key={m.profileId} brandId={brand.id} isOwner={isOwner} me={user.id} m={{ ...m, ...(dir.get(m.profileId) ?? { name: "", email: "" }) }} />)}
        </ul>
        {isOwner && (
          <div className="pt-8">
            <h3 className="label mb-2">{tk("bsettings.invite")}</h3>
            <InviteMemberForm brandId={brand.id} />
            {s.invites.length > 0 && (
              <div className="mt-8">
                <h3 className="label">{tk("bsettings.pendingInvites")}</h3>
                <ul className="mt-2 text-meta text-ink-2">
                  {s.invites.map((i) => <li key={i.id} className="border-b border-line py-2">{i.email}{i.can_purchase ? ` · ${tk("bsettings.canPurchase")}` : ""} · <span className="num">{tk("bsettings.expires", { date: fmtDay(i.expires_at) })}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="section">
        <div className="section-h" id="address"><h2>{tk("bsettings.address")}</h2></div>
        <p className="mt-3 text-meta text-ink-2">{tk("bsettings.addressHelp")}</p>
        <div className="mt-8"><AddressForm brandId={brand.id} value={s.address} canEdit={isOwner} /></div>
      </section>
      <div className="section grid gap-x-6 gap-y-14 md:grid-cols-2">
        <section>
          <div className="section-h"><h2>{tk("bsettings.notify")}</h2></div>
          <div className="mt-3"><DigestToggle brandId={brand.id} on={s.digest} disabled={member.onBehalf} /></div>
        </section>
        <section>
          <div className="section-h"><h2>{tk("bsettings.slug")}</h2></div>
          <div className="mt-3"><SlugForm brandId={brand.id} slug={s.slug} pendingSlug={s.pendingSlug} canEdit={isOwner} /></div>
        </section>
      </div>
      </div>
    </div>
  );
}
