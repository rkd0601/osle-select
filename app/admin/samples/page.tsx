import Link from "next/link";
import { listSamplesForAdmin } from "@/lib/db/admin/samples";
import { returnOverdue } from "@/lib/samples";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";

/**
 * A-05 샘플 관리 큐: 입금 확인 대기 / 출고 대기 / 위아더 도착·검품 / 발송 / 피드백·회수 / **회수 기한 경과**(자동 표시, 청구는 수동).
 * 레이아웃이 ADMIN을 검증한다.
 */
export default async function AdminSamples() {
  const rows = await listSamplesForAdmin();
  const now = new Date();
  const sections: [string, typeof rows][] = [
    ["payment", rows.filter((r) => r.status === "awaiting_payment")],
    ["cn", rows.filter((r) => r.status === "requested" || r.status === "cn_shipped")],
    ["inspect", rows.filter((r) => r.status === "kr_arrived" || r.status === "inspected")],
    ["brand", rows.filter((r) => ["sent_to_brand", "delivered", "feedback_done"].includes(r.status))],
    ["overdue", rows.filter((r) => r.items.some((i) => returnOverdue(i, r.return_due, now)))],
  ];
  return (
    <div className="space-y-8">
      <h1 className="text-[20px] font-bold">{tk("admin.samples.title")}</h1>
      {sections.map(([k, list]) => (
        <section key={k}>
          <h2 className={`text-[13px] font-semibold ${k === "overdue" && list.length ? "text-crit" : ""}`}>{tk(`admin.samples.section.${k}`)} <span className="num text-muted">{list.length}</span></h2>
          {list.length === 0 ? <p className="mt-1 text-[12px] text-muted">-</p> : (
            <table className="mt-2 w-full text-[13px]">
              <tbody className="divide-y divide-line">
                {list.map((r) => {
                  const brand = Array.isArray(r.brands) ? r.brands[0] : r.brands;
                  return (
                    <tr key={r.id} className="bg-surface">
                      <td className="py-2 pr-3"><Link href={`/admin/samples/${r.id}`} className="hover:underline">{brand?.name} · {fmtDate(r.created_at)}</Link></td>
                      <td className="num text-ink-2">{tk("sample.list.qty", { n: r.items.reduce((s, i) => s + i.qty, 0) })}</td>
                      <td className="num">₩{krw(r.logistics_fee_krw)}</td>
                      <td>{r.payment_reported_at && !r.payment_confirmed_at ? <span className="text-[11px] text-warn">{tk("admin.samples.reported")}</span> : null}</td>
                      <td><StatusPill entity="sample_request" status={r.status} /></td>
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
