import { requireBrandMember } from "@/lib/auth/session";
import { loadBrandSettings } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { PageHeader } from "@/components/domain/page-header";
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
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={tk("eyebrow.settings")} title={tk("bsettings.title")} description={tk("bsettings.lead")} />
      <div className="space-y-6">
        <section className="card overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-h4 font-bold">{tk("bsettings.members")} <span className="num ml-1 text-ink-2">{s.members.length}</span></h2>
            {!isOwner && <span className="text-caption text-ink-2">{tk("bsettings.ownerOnly")}</span>}
          </div>
          <ul className="divide-y divide-line">
            {s.members.map((m) => <MemberRow key={m.profileId} brandId={brand.id} isOwner={isOwner} me={user.id} m={{ ...m, ...(dir.get(m.profileId) ?? { name: "", email: "" }) }} />)}
          </ul>
          {isOwner && (
            <div className="space-y-3 border-t border-line bg-paper px-5 py-4">
              <h3 className="eyebrow">{tk("bsettings.invite")}</h3>
              <InviteMemberForm brandId={brand.id} />
              {s.invites.length > 0 && (
                <div>
                  <h3 className="mt-4 text-meta font-medium text-ink-2">{tk("bsettings.pendingInvites")}</h3>
                  <ul className="mt-1 text-meta text-ink-2">
                    {s.invites.map((i) => <li key={i.id} className="py-0.5">{i.email}{i.can_purchase ? ` · ${tk("bsettings.canPurchase")}` : ""} · <span className="num">{tk("bsettings.expires", { date: fmtDate(i.expires_at, "ko") })}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        <section className="card card-pad">
          <h2 className="text-h4 font-bold">{tk("bsettings.address")}</h2>
          <p className="mt-1 text-meta text-ink-2">{tk("bsettings.addressHelp")}</p>
          <div className="mt-4"><AddressForm brandId={brand.id} value={s.address} canEdit={isOwner} /></div>
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="card card-pad">
            <h2 className="text-h4 font-bold">{tk("bsettings.notify")}</h2>
            <div className="mt-3"><DigestToggle brandId={brand.id} on={s.digest} disabled={member.onBehalf} /></div>
          </section>
          <section className="card card-pad">
            <h2 className="text-h4 font-bold">{tk("bsettings.slug")}</h2>
            <div className="mt-3"><SlugForm brandId={brand.id} slug={s.slug} pendingSlug={s.pendingSlug} canEdit={isOwner} /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
