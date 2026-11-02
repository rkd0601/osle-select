import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBrandForAdmin } from "@/lib/db/admin/brands";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BrandTermsForm, CreditForm, InviteForm, SlugRequestDecision, StatusToggle } from "../brand-controls";

/** A-07 브랜드 상세: 조건(등급·수수료·숨은 마진) · 크레딧 · 정지 · 멤버·초대 · 감사 로그 */
export default async function AdminBrandDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const d = await getBrandForAdmin(id);
  if (!d) notFound();
  const b = d.brand;
  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/admin/brands" className="text-[12px] text-muted">{tk("common.back")}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold">{b.name}</h1>
        <Link href={`/b/${b.slug}`} className="text-[12px] text-signature">/b/{b.slug} ↗</Link>
        <StatusToggle brandId={b.id} status={b.status} />
      </div>
      {d.slugRequest && <SlugRequestDecision req={d.slugRequest} from={b.slug} />}
      <section className="space-y-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("admin.brands.terms")}</h2>
        <BrandTermsForm brandId={b.id} tier={b.tier} feeRate={b.fee_rate == null ? null : Number(b.fee_rate)} marginRate={b.hidden_margin_rate == null ? null : Number(b.hidden_margin_rate)} liveOffers={d.liveOffers} />
        <p className="text-[11px] text-muted">{tk("admin.brands.termsHelp")}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("admin.brands.credit")} <span className="num text-ink">₩{krw(b.credit_balance_krw)}</span></h2>
        <CreditForm brandId={b.id} />
      </section>
      <section className="space-y-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("admin.brands.members")}</h2>
        <ul className="divide-y divide-line border-y border-line text-[13px]">
          {d.members.map((m) => (
            <li key={m.profile_id} className="flex gap-3 py-2">
              <span className="font-medium">{((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { display_name?: string } | null)?.display_name ?? m.profile_id.slice(0, 8)}</span>
              <span className="text-ink-2">{tk(`admin.brands.level.${m.level}`)}{m.can_purchase && m.level !== "owner" ? ` · ${tk("admin.brands.canPurchase")}` : ""}</span>
            </li>
          ))}
          {d.invites.filter((i) => !i.accepted_at).map((i) => (
            <li key={i.id} className="flex gap-3 py-2 text-muted">
              <span>{i.email}</span><span>{tk("admin.brands.invited", { date: fmtDate(i.expires_at) })}</span>
            </li>
          ))}
        </ul>
        <InviteForm brandId={b.id} />
      </section>
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("admin.orders.audit")}</h2>
        <ul className="num mt-2 space-y-1 text-[12px] text-ink-2">
          {d.logs.map((l, i) => <li key={i}>{fmtDate(l.created_at, "ko", true)} · {l.action} · {JSON.stringify(l.diff)}</li>)}
        </ul>
      </section>
    </div>
  );
}
