import Link from "next/link";
import { getAdminPendingCounts, getAdminQueue, getKpis } from "@/lib/db/admin/dashboard";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";

/**
 * A-01 대시보드: KPI 보드(최근 90일) + 지연 순 큐(위아더 담당 + 중국 담당 지연). 레이아웃이 ADMIN을 검증한다.
 * 숫자는 SUIT tabular로 크게(D19). 가격·원가 숫자는 없다.
 */
export default async function AdminHome() {
  const [queue, k, pend] = await Promise.all([getAdminQueue(), getKpis(), getAdminPendingCounts()]);
  const now = new Date();
  const overdue = queue.filter((r) => isOverdue(r.due_at, now)).length;
  const tiles: [string, string, string | null][] = [
    ["matchRate", k.matchRate != null ? `${k.matchRate}%` : "—", tk("admin.kpi.inspections", { n: k.inspections })],
    ["offerInterest", k.offerInterest != null ? `${k.offerInterest}%` : "—", null],
    ["sampleToOrder", k.sampleToOrder != null ? `${k.sampleToOrder}%` : "—", null],
    ["orderOverdue", k.orderOverdue != null ? `${k.orderOverdue}%` : "—", null],
    ["unreturned", String(k.unreturned), null],
  ];
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-h2 font-bold">{tk("admin.kpi.title")}</h1>
        <div className="mt-4 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-5">
          {tiles.map(([key, value, sub]) => (
            <div key={key} className="bg-surface p-4">
              <div className="text-caption text-muted">{tk(`admin.kpi.${key}`)}</div>
              <div className="num mt-1 text-display-s font-semibold leading-none tracking-tight">{value}</div>
              {sub && <div className="num mt-1 text-caption text-muted">{sub}</div>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-caption text-muted">{tk("admin.kpi.help")}</p>
      </section>
      <section>
        <h2 className="text-h5 font-bold">
          {tk("admin.queue")} <span className="num ml-2 text-body text-ink-2">{queue.length}</span>
          {overdue > 0 && <span className="num ml-2 text-body text-crit">{tk("admin.queue.overdue", { n: overdue })}</span>}
        </h2>
        {(pend.applications > 0 || pend.slugRequests > 0) && (
          <p className="mt-2 text-body text-ink-2">
            {pend.applications > 0 && <Link href="/admin/brands" className="mr-4 hover:underline">{tk("admin.queue.applications", { n: pend.applications })}</Link>}
            {pend.slugRequests > 0 && <Link href="/admin/brands" className="hover:underline">{tk("admin.queue.slugRequests", { n: pend.slugRequests })}</Link>}
          </p>
        )}
        {queue.length === 0 ? <p className="mt-2 text-body text-ink-2">{tk("admin.queue.empty")}</p> : (
          <table className="mt-3 w-full text-body">
            <thead className="text-left text-caption text-muted">
              <tr><th className="py-1 font-normal">{tk("admin.queue.what")}</th><th className="font-normal">{tk("admin.queue.status")}</th><th className="font-normal">{tk("admin.queue.owner")}</th><th className="text-right font-normal">{tk("admin.queue.due")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {queue.slice(0, 200).map((r) => (
                <tr key={`${r.entity}-${r.id}`} className="bg-surface">
                  <td className="py-2 pr-3"><Link href={r.href} className="hover:underline">{tk(`entity.${r.entity}`)}{r.brand ? ` · ${r.brand}` : ""}</Link></td>
                  <td className="text-ink-2">{tk(`status.${r.entity}.${r.status}`)}</td>
                  <td className={r.owner_role === "CN" ? "text-warn" : "text-ink-2"}>{tk(`admin.queue.ownerRole.${r.owner_role}`)}</td>
                  <td className={`num text-right ${isOverdue(r.due_at, now) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(r.due_at, "ko", true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
