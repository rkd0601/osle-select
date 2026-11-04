import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBrandForAdmin } from "@/lib/db/admin/brands";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { BackLink, DetailLayout, Facts, Section } from "../../_ui/ui";
import { BrandTermsForm, CreditForm, InviteForm, SlugRequestDecision, StatusToggle } from "../brand-controls";

/** A-07 브랜드 상세: 조건(등급·수수료·숨은 마진) · 크레딧 · 정지 · 멤버·초대 · 감사 로그 */
export default async function AdminBrandDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const d = await getBrandForAdmin(id);
  if (!d) notFound();
  const b = d.brand;
  const pending = d.invites.filter((i) => !i.accepted_at);
  const pct = (v: number | string | null) => (v == null ? tk("admin.brands.default") : `${Math.round(Number(v) * 1000) / 10}%`);
  return (
    <div>
      <BackLink href="/admin/brands" />
      <PageHeader eyebrow={`${tk("admin.brands.list")} · ${tk(`admin.brands.tier.${b.tier}`)}`} title={b.name}
        actions={<Link href={`/b/${b.slug}`} className="btn btn-secondary btn-sm">/b/{b.slug} ↗</Link>}>
        <StatusToggle brandId={b.id} status={b.status} />
      </PageHeader>
      {d.slugRequest && <div className="mb-6"><SlugRequestDecision req={d.slugRequest} from={b.slug} /></div>}
      <DetailLayout
        main={
          <>
            <Section title={tk("admin.brands.terms")}>
              <BrandTermsForm brandId={b.id} tier={b.tier} feeRate={b.fee_rate == null ? null : Number(b.fee_rate)} marginRate={b.hidden_margin_rate == null ? null : Number(b.hidden_margin_rate)} liveOffers={d.liveOffers} />
              <p className="mt-3 text-caption text-muted">{tk("admin.brands.termsHelp")}</p>
            </Section>
            <Section title={tk("admin.brands.members")} count={d.members.length} flush>
              <ul className="divide-y divide-line text-body">
                {d.members.map((m) => (
                  <li key={m.profile_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="font-medium">{m.display_name ?? m.profile_id.slice(0, 8)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${m.level === "owner" ? "bg-ink text-paper" : "bg-sand text-ink-2"}`}>{tk(`admin.brands.level.${m.level}`)}</span>
                    {m.can_purchase && m.level !== "owner" && <span className="text-meta text-ink-2">{tk("admin.brands.canPurchase")}</span>}
                    {m.joined_at && <span className="num ml-auto text-caption text-muted">{fmtDate(m.joined_at)}</span>}
                  </li>
                ))}
                {pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-ink-2">
                    <span>{i.email}</span><span className="text-meta">{tk("admin.brands.invited", { date: fmtDate(i.expires_at) })}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-4"><InviteForm brandId={b.id} /></div>
            </Section>
            <Section title={tk("admin.orders.audit")} count={d.logs.length}>
              {d.logs.length === 0 ? <p className="text-body text-ink-2">-</p> : (
                <ul className="num space-y-1.5 text-meta text-ink-2">
                  {d.logs.map((l, i) => (
                    <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                      <span className="text-muted">{fmtDate(l.created_at, "ko", true)}</span>
                      <span className="min-w-0 break-all"><span className="font-semibold text-ink">{l.action}</span> · {JSON.stringify(l.diff)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        }
        aside={
          <>
            <Section title={tk("admin.brands.credit")} tone="brand">
              <div className="num text-title font-semibold leading-none">₩{krw(b.credit_balance_krw)}</div>
              <div className="mt-4"><CreditForm brandId={b.id} /></div>
            </Section>
            <Section title={tk("admin.ui.overview")}>
              <Facts rows={[
                [tk("admin.brands.tier"), tk(`admin.brands.tier.${b.tier}`)],
                [tk("admin.brands.fee"), <span key="f" className="num">{pct(b.fee_rate)}</span>],
                [tk("admin.brands.margin"), <span key="m" className="num">{pct(b.hidden_margin_rate)}</span>],
                [tk("admin.brands.liveOffers"), <span key="o" className="num">{d.liveOffers}</span>],
                [tk("admin.brands.status"), <span key="s" className={b.status === "suspended" ? "font-semibold text-crit" : ""}>{tk(`admin.brands.status.${b.status}`)}</span>],
                [tk("admin.brands.approvedAt"), <span key="a" className="num">{b.approved_at ? fmtDate(b.approved_at) : "-"}</span>],
              ]} />
            </Section>
          </>
        }
      />
    </div>
  );
}
