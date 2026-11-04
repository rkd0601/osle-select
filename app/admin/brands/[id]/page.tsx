import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBrandForAdmin } from "@/lib/db/admin/brands";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { Figure } from "@/components/domain/figure";
import { BackLink, DetailLayout, Facts, LogList, Section } from "../../_ui/ui";
import { BrandTermsForm, CreditForm, InviteForm, SlugRequestDecision, StatusToggle } from "../brand-controls";

/** A-07 브랜드 상세: 조건(등급·수수료·숨은 마진) · 크레딧 · 정지 · 멤버·초대 · 감사 로그. 룰 섹션 + 오른쪽 360(크레딧·요약) */
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
      <PageHeader eyebrow={tk("admin.brands.list")} title={b.name}
        actions={<Link href={`/b/${b.slug}`} className="link num">/b/{b.slug}</Link>}>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`chip ${b.tier === "proven" ? "ink" : ""}`}>{tk(`admin.brands.tier.${b.tier}`)}</span>
          <StatusToggle brandId={b.id} status={b.status} />
        </div>
      </PageHeader>
      {d.slugRequest && <div className="mb-10"><SlugRequestDecision req={d.slugRequest} from={b.slug} /></div>}
      <DetailLayout
        main={
          <>
            <Section title={tk("admin.brands.terms")}>
              <BrandTermsForm brandId={b.id} tier={b.tier} feeRate={b.fee_rate == null ? null : Number(b.fee_rate)} marginRate={b.hidden_margin_rate == null ? null : Number(b.hidden_margin_rate)} liveOffers={d.liveOffers} />
              <p className="mt-2 text-caption text-muted">{tk("admin.brands.termsHelp")}</p>
            </Section>
            <Section title={tk("admin.brands.members")} count={d.members.length}>
              <ul className="text-body">
                {d.members.map((m) => (
                  <li key={m.profile_id} className="flex flex-wrap items-center gap-3 border-b border-line py-3">
                    <span className="font-medium">{m.display_name ?? m.profile_id.slice(0, 8)}</span>
                    <span className={`chip ${m.level === "owner" ? "ink" : ""}`}>{tk(`admin.brands.level.${m.level}`)}</span>
                    {m.can_purchase && m.level !== "owner" && <span className="text-meta text-ink-2">{tk("admin.brands.canPurchase")}</span>}
                    {m.joined_at && <span className="num ml-auto text-meta text-muted">{fmtDate(m.joined_at)}</span>}
                  </li>
                ))}
                {pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 text-ink-2">
                    <span>{i.email}</span><span className="st wait">{tk("admin.brands.invited", { date: fmtDate(i.expires_at) })}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-5"><InviteForm brandId={b.id} /></div>
            </Section>
            <Section title={tk("admin.orders.audit")} count={d.logs.length}>
              <LogList logs={d.logs} />
            </Section>
          </>
        }
        aside={
          <>
            <Figure first label={tk("admin.brands.credit")} currency="₩" value={new Intl.NumberFormat("ko-KR").format(b.credit_balance_krw)} />
            <div className="mt-6"><CreditForm brandId={b.id} /></div>
            <div className="mt-12">
              <Facts rows={[
                [tk("admin.brands.fee"), <span key="f" className="num">{pct(b.fee_rate)}</span>],
                [tk("admin.brands.margin"), <span key="m" className="num">{pct(b.hidden_margin_rate)}</span>],
                [tk("admin.brands.liveOffers"), <span key="o" className="num">{d.liveOffers}</span>],
                [tk("admin.brands.approvedAt"), <span key="a" className="num">{b.approved_at ? fmtDate(b.approved_at) : "-"}</span>],
              ]} />
            </div>
          </>
        }
      />
    </div>
  );
}
