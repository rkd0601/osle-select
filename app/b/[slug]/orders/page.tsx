import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOrders } from "@/lib/db/brand/orders";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";

/** B-09 발주 현황 목록 — 상태(누구 차례) · 수량 · 확정 금액 · 미송 표시 */
export default async function OrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const rows = await listBrandOrders(brand.id);
  return (
    <div>
      <div className="flex items-end justify-between border-b border-ink pb-3">
        <h1 className="text-title-l font-bold tracking-tight">{tk("order.list.title")}</h1>
        <Link href={`/b/${slug}/orders/new`} className="bg-ink px-4 py-2 text-body font-medium text-paper">{tk("order.list.new")}</Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-lead text-ink-2">{tk("order.list.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/b/${slug}/orders/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-4 hover:bg-surface sm:grid-cols-[96px_1fr_auto_auto]">
                <span className="num hidden text-body text-ink-2 sm:block">{fmtDate(r.created_at)}</span>
                <span className="text-strong">
                  {tk("order.list.qty", { n: r.qty })}
                  {r.gb_close_date && <span className="num ml-2 text-meta text-muted">{tk("order.list.gbClose", { date: fmtDate(r.gb_close_date) })}</span>}
                  {r.backorders > 0 && <span className="ml-2 text-meta text-warn">{tk("order.list.backorders", { n: r.backorders })}</span>}
                </span>
                <span className="num hidden text-body sm:block">{r.total != null ? `₩${krw(r.total)}` : "—"}</span>
                <StatusPill entity="order" status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
