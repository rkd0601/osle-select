import { requireBrandMember } from "@/lib/auth/session";
import { loadBrandSettings } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { AddressForm, DigestToggle, InviteMemberForm, MemberRow, SlugForm } from "./settings-forms";

/**
 * B-10 브랜드 설정 (PRD 5장): 멤버·발주 권한(owner만), 기본 배송지, 내 알림(digest만 끌 수 있음 — DECISIONS r6-2), 주소 변경 요청(9-8).
 * 버튼은 화면에서도 숨기지만 서버 액션이 owner·본인 여부를 다시 확인한다.
 */
export default async function BrandSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, brand, member } = await requireBrandMember(slug);
  const s = await loadBrandSettings(brand.id, user.id);
  const dir = await memberDirectory(s.members.map((m) => m.profileId));
  const isOwner = member.level === "owner";
  const h2 = "text-[12px] font-semibold uppercase tracking-wide text-muted";
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <h1 className="text-[28px] font-bold tracking-tight">{tk("bsettings.title")}</h1>
      <section>
        <h2 className={h2}>{tk("bsettings.members")} <span className="num">{s.members.length}</span></h2>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {s.members.map((m) => <MemberRow key={m.profileId} brandId={brand.id} isOwner={isOwner} me={user.id} m={{ ...m, ...(dir.get(m.profileId) ?? { name: "", email: "" }) }} />)}
        </ul>
        {isOwner ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-[13px] font-semibold">{tk("bsettings.invite")}</h3>
            <InviteMemberForm brandId={brand.id} />
            {s.invites.length > 0 && (
              <div>
                <h3 className="mt-4 text-[12px] text-muted">{tk("bsettings.pendingInvites")}</h3>
                <ul className="mt-1 text-[12px] text-ink-2">
                  {s.invites.map((i) => <li key={i.id} className="py-0.5">{i.email}{i.can_purchase ? ` · ${tk("bsettings.canPurchase")}` : ""} · <span className="num">{tk("bsettings.expires", { date: fmtDate(i.expires_at, "ko") })}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        ) : <p className="mt-3 text-[12px] text-muted">{tk("bsettings.ownerOnly")}</p>}
      </section>
      <section>
        <h2 className={h2}>{tk("bsettings.address")}</h2>
        <p className="mt-1 text-[12px] text-ink-2">{tk("bsettings.addressHelp")}</p>
        <div className="mt-3"><AddressForm brandId={brand.id} value={s.address} canEdit={isOwner} /></div>
      </section>
      <section>
        <h2 className={h2}>{tk("bsettings.notify")}</h2>
        <div className="mt-2"><DigestToggle brandId={brand.id} on={s.digest} disabled={member.onBehalf} /></div>
      </section>
      <section>
        <h2 className={h2}>{tk("bsettings.slug")}</h2>
        <div className="mt-2"><SlugForm brandId={brand.id} slug={s.slug} pendingSlug={s.pendingSlug} canEdit={isOwner} /></div>
      </section>
    </div>
  );
}
