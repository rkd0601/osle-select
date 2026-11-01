import Link from "next/link";
import { listRequestQueue } from "@/lib/db/admin/requests";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { REQUEST_ITEM_STATUS } from "@/lib/transitions";
import type { RequestItemStatus } from "@/lib/requests";

const TABS = ["open", "received", "needs_info", "assigned", "sourcing", "offered", "on_hold"] as const;

/** A-02 요청 접수·배정 큐. 항목 단위, 기한 순(지연 먼저). 레이아웃이 ADMIN을 검증한다. */
export default async function AdminRequests({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = (REQUEST_ITEM_STATUS as readonly string[]).includes(status ?? "") ? (status as RequestItemStatus) : "open";
  const rows = await listRequestQueue({ status: filter });
  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="text-[20px] font-bold">{tk("admin.requests.title")}</h1>
        <Link href="/admin/requests/new" className="bg-ink px-3 py-1.5 text-[13px] text-paper">{tk("admin.requests.proxy")}</Link>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-line text-[12px]">
        {TABS.map((tab) => (
          <Link key={tab} href={tab === "open" ? "/admin/requests" : `/admin/requests?status=${tab}`} className={`px-3 py-2 ${filter === tab ? "border-b-2 border-ink font-semibold" : "text-ink-2"}`}>
            {tab === "open" ? tk("admin.requests.filter.open") : tk(`status.request_item.${tab}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="py-10 text-[13px] text-muted">{tk("admin.requests.empty")}</p>
      ) : (
        <table className="mt-2 w-full text-[13px]">
          <thead className="text-left text-[11px] text-ink-2">
            <tr>
              <th className="py-2">{tk("admin.requests.col.item")}</th>
              <th>{tk("admin.requests.col.brand")}</th>
              <th>{tk("admin.requests.col.status")}</th>
              <th>{tk("admin.requests.col.owner")}</th>
              <th className="text-right">{tk("admin.requests.col.due")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const brand = Array.isArray(r.brands) ? r.brands[0] : r.brands;
              const req = Array.isArray(r.requests) ? r.requests[0] : r.requests;
              return (
                <tr key={r.id} className="bg-surface">
                  <td className="py-2.5 pr-3">
                    <Link href={`/admin/requests/${r.request_id}`} className="hover:underline">
                      <span className="num mr-2 text-muted">#{r.seq}</span>
                      {r.description}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {req?.title}
                      {req?.created_via === "admin_proxy" && ` · ${tk("request.proxyBadge")}`}
                      {!r.description_zh && <span className="ml-2 text-warn">中文 -</span>}
                    </div>
                  </td>
                  <td className="text-ink-2">{brand?.name}</td>
                  <td><StatusPill entity="request_item" status={r.status} /></td>
                  <td className="text-[12px] text-ink-2">{r.owner_role ?? "-"}</td>
                  <td className={`num text-right ${isOverdue(r.due_at) ? "font-semibold text-crit" : ""}`}>{fmtDate(r.due_at, "ko", true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
