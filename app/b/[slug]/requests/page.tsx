import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandRequests } from "@/lib/db/brand/requests";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";

/** B-03 요청 목록. 집계 상태 + 내 차례 기한. 상품 그리드가 아니라 에디토리얼 리스트(1px 룰). */
export default async function RequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const rows = await listBrandRequests(brand.id);
  return (
    <div>
      <div className="flex items-end justify-between border-b border-ink pb-3">
        <h1 className="text-[28px] font-bold tracking-tight">{tk("request.list.title")}</h1>
        <Link href={`/b/${slug}/requests/new`} className="bg-ink px-4 py-2 text-[13px] font-medium text-paper">{tk("request.list.new")}</Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-muted">{tk("request.list.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/b/${slug}/requests/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-4 hover:bg-surface sm:grid-cols-[96px_1fr_auto_auto]">
                <span className="num hidden text-[13px] text-muted sm:block">{fmtDate(r.created_at)}</span>
                <span className="truncate text-[15px] font-medium">{r.title}</span>
                <span className="num hidden text-[12px] text-muted sm:block">{tk("request.list.items", { n: r.itemCount })}</span>
                <span className="flex items-center gap-2">
                  {r.brandDue && <span className="num text-[11px] text-signature">{fmtDate(r.brandDue)}</span>}
                  <StatusPill entity="request" status={r.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
