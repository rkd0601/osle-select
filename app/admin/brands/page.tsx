import Link from "next/link";
import { listBrandsForAdmin } from "@/lib/db/admin/brands";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ApplicationRow } from "./brand-controls";

/** A-07 브랜드 관리: 대기 중 신청(승인·반려) + 브랜드 목록(등급·수수료·숨은 마진·크레딧·멤버) */
export default async function AdminBrands() {
  const { brands, applications } = await listBrandsForAdmin();
  const pct = (v: number | string | null) => (v == null ? tk("admin.brands.default") : `${Math.round(Number(v) * 1000) / 10}%`);
  return (
    <div className="space-y-10">
      <h1 className="text-h1-s font-bold">{tk("admin.nav.brands")}</h1>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("admin.brands.applications")} <span className="num">{applications.length}</span></h2>
        {applications.length === 0 ? <p className="mt-2 text-body text-muted">{tk("admin.brands.noApplications")}</p> : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {applications.map((a) => <li key={a.id} className="py-3"><ApplicationRow a={{ ...a, channels: (Array.isArray(a.channels) ? a.channels : []) as string[] }} /></li>)}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("admin.brands.list")}</h2>
        <table className="mt-2 w-full text-body">
          <thead className="text-left text-caption text-muted"><tr className="border-b border-ink">
            <th className="py-2">{tk("admin.brands.name")}</th><th>{tk("admin.brands.tier")}</th><th className="text-right">{tk("admin.brands.fee")}</th>
            <th className="text-right">{tk("admin.brands.margin")}</th><th className="text-right">{tk("admin.brands.credit")}</th><th className="text-right">{tk("admin.brands.members")}</th><th>{tk("admin.brands.status")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {brands.map((b) => (
              <tr key={b.id}>
                <td className="py-2"><Link href={`/admin/brands/${b.id}`} className="font-medium hover:underline">{b.name}</Link> <span className="text-caption text-muted">/{b.slug}</span></td>
                <td>{tk(`admin.brands.tier.${b.tier}`)}</td>
                <td className="num text-right">{pct(b.fee_rate)}</td><td className="num text-right">{pct(b.hidden_margin_rate)}</td>
                <td className="num text-right">₩{krw(b.credit_balance_krw)}</td><td className="num text-right">{b.members}</td>
                <td className={b.status === "suspended" ? "text-crit" : "text-ink-2"}>{tk(`admin.brands.status.${b.status}`)} <span className="num text-caption text-muted">{b.approved_at ? fmtDate(b.approved_at) : ""}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
