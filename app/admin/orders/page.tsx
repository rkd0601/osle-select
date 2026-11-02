import Link from "next/link";
import { listOrdersForAdmin } from "@/lib/db/admin/orders";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";

/**
 * A-06 발주 관리 큐: 재고 확인 / 선금(입금 신고) / 견적 / 확정 대기 / 출고·검품·발송 / 브랜드 차례 / 미송 / 크레딧 처리. 기한 순.
 * 레이아웃이 ADMIN을 검증한다.
 */
export default async function AdminOrders() {
  const rows = await listOrdersForAdmin();
  const has = (r: (typeof rows)[number], s: string[]) => s.includes(r.status);
  const sections: [string, typeof rows][] = [
    ["stock", rows.filter((r) => has(r, ["reserved", "stock_checking", "stock_short", "stock_confirmed", "partial_confirmed"]))],
    ["deposit", rows.filter((r) => has(r, ["deposit_pending", "hold_confirmed"]))],
    ["quote", rows.filter((r) => has(r, ["quoting", "qty_confirmed", "final_quoted"]))],
    ["ship", rows.filter((r) => has(r, ["confirmed", "cn_shipped", "kr_inspecting"]))],
    ["brand", rows.filter((r) => has(r, ["quoted", "sent_to_brand", "delivered"]))],
    ["backorder", rows.filter((r) => r.order_lines.some((l) => l.backorder_status === "backordered"))],
    ["credit", rows.filter((r) => r.status === "report_done" && r.credit_issued_krw === 0)],
  ];
  return (
    <div className="space-y-8">
      <h1 className="text-h2 font-bold">{tk("admin.orders.title")}</h1>
      {sections.map(([k, list]) => (
        <section key={k}>
          <h2 className="text-body font-semibold">{tk(`admin.orders.section.${k}`)} <span className="num text-muted">{list.length}</span></h2>
          {list.length === 0 ? <p className="mt-1 text-meta text-muted">-</p> : (
            <table className="mt-2 w-full text-body">
              <tbody className="divide-y divide-line">
                {list.map((r) => {
                  const brand = Array.isArray(r.brands) ? r.brands[0] : r.brands;
                  const qty = r.order_lines.reduce((s, l) => s + (l.qty || l.expected_qty), 0);
                  return (
                    <tr key={r.id} className="bg-surface">
                      <td className="py-2 pr-3"><Link href={`/admin/orders/${r.id}`} className="hover:underline">{brand?.name} · {fmtDate(r.created_at)}</Link></td>
                      <td className="num text-ink-2">{tk("order.list.qty", { n: qty })}</td>
                      <td className="num">{r.deposit_krw != null ? `₩${krw(r.deposit_krw)}` : ""}</td>
                      <td>{r.deposit_reported_at && !r.deposit_confirmed_at ? <span className="text-caption text-warn">{tk("admin.samples.reported")}</span> : null}</td>
                      <td><StatusPill entity="order" status={r.status} /></td>
                      <td className={`num text-right ${isOverdue(r.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(r.due_at, "ko", true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
