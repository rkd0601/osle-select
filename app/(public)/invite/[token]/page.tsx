import { getInvitePreview } from "./actions";
import { InviteAcceptForm } from "./invite-form";
import { tk } from "@/lib/i18n";
import { SERVICE } from "@/lib/config";

/** P-03 초대 수락: 초대 링크 → 이름·연락처 → 이메일 OTP 로그인 → 수락 → 브랜드 공간 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 text-xs font-medium tracking-[0.16em] text-muted">{SERVICE.name.toUpperCase()} · 초대</div>
      {preview.ok ? (
        <>
          <h1 className="text-h2 font-bold leading-snug">{tk("invite.title", { brand: preview.data.brandName })}</h1>
          {preview.data.invitedByName && <p className="mt-1 text-body text-ink-2">{tk("invite.invitedBy", { name: preview.data.invitedByName })}</p>}
          <div className="mt-6">
            <InviteAcceptForm token={token} email={preview.data.email} slug={preview.data.brandSlug} />
          </div>
        </>
      ) : (
        <p className="text-lead text-crit">{tk(preview.error)}</p>
      )}
    </main>
  );
}
