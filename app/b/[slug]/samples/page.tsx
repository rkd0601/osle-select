import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandSamples } from "@/lib/db/brand/samples";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";

/** B-07 샘플 현황 목록 — 상태·수량·청구 예정(물류비 + 미회수 청구) */
export default async function SamplesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const rows = await listBrandSamples(brand.id);
  return (
    <div>
      <div className="flex items-end justify-between border-b border-ink pb-3">
        <h1 className="text-[28px] font-bold tracking-tight">{tk("sample.list.title")}</h1>
        <Link href={`/b/${slug}/samples/new`} className="bg-ink px-4 py-2 text-[13px] font-medium text-paper">{tk("sample.list.new")}</Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-muted">{tk("sample.list.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/b/${slug}/samples/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-4 hover:bg-surface sm:grid-cols-[96px_1fr_auto_auto]">
                <span className="num hidden text-[13px] text-muted sm:block">{fmtDate(r.created_at)}</span>
                <span className="text-[15px]">{tk("sample.list.qty", { n: r.qty })}</span>
                <span className="num hidden text-[13px] sm:block">₩{krw(r.logistics_fee_krw + r.charged)}</span>
                <StatusPill entity="sample_request" status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
