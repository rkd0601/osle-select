import Link from "next/link";
import { getAdminPendingCounts, getAdminQueue, getKpis } from "@/lib/db/admin/dashboard";
import { PageHeader } from "@/components/domain/page-header";
import { StatGrid } from "@/components/domain/stat";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { StatusPill } from "@/components/domain/status-pill";
import { isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { Due, ListEmpty, lateRow, sp, type SearchParams } from "./_ui/ui";

/**
 * A-01 대시보드: KPI 보드(최근 90일) + 확인 대기(가입 신청·주소 변경) + 기한 순 큐(담당 칩: 위아더/중국/브랜드/지연).
 * 레이아웃이 ADMIN을 검증한다. 숫자는 SUIT tabular로 크게(D19). 가격·원가 숫자는 없다.
 */
const OWNERS = ["all", "ADMIN", "CN", "BRAND", "overdue"] as const;
type Owner = (typeof OWNERS)[number];
const PILL = new Set(["request_item", "product", "sample_request", "order"]);
const SHOW = 200;

export default async function AdminHome({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const q = await searchParams;
  const owner: Owner = (OWNERS as readonly string[]).includes(sp(q.owner) ?? "") ? (sp(q.owner) as Owner) : "all";
  const [queue, k, pend] = await Promise.all([getAdminQueue(), getKpis(), getAdminPendingCounts()]);
  const now = new Date();
  const late = (r: (typeof queue)[number]) => isOverdue(r.due_at, now);
  const inOwner = (o: Owner) => (o === "all" ? queue : o === "overdue" ? queue.filter(late) : queue.filter((r) => r.owner_role === o));
  const rows = inOwner(owner);
  const overdue = queue.filter(late).length;
  const label = (o: Owner) => (o === "all" ? tk("admin.ui.all") : o === "overdue" ? tk("admin.ui.overdue") : tk(`admin.queue.ownerRole.${o}`));

  return (
    <div className="space-y-10">
      <PageHeader eyebrow={tk("admin.nav.group.ops")} title={tk("admin.nav.dashboard")} description={tk("admin.dash.lead")} />

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-h5 font-bold">{tk("admin.kpi.title")}</h2>
        </div>
        <StatGrid columns={5} items={[
          { label: tk("admin.kpi.matchRate"), value: k.matchRate != null ? `${k.matchRate}%` : "—", hint: tk("admin.kpi.inspections", { n: k.inspections }), tone: "brand" },
          { label: tk("admin.kpi.offerInterest"), value: k.offerInterest != null ? `${k.offerInterest}%` : "—" },
          { label: tk("admin.kpi.sampleToOrder"), value: k.sampleToOrder != null ? `${k.sampleToOrder}%` : "—" },
          { label: tk("admin.kpi.orderOverdue"), value: k.orderOverdue != null ? `${k.orderOverdue}%` : "—", tone: k.orderOverdue ? "warn" : "default", href: "/admin/orders" },
          { label: tk("admin.kpi.unreturned"), value: k.unreturned, tone: k.unreturned ? "warn" : "default", href: "/admin/samples?tab=overdue" },
        ]} />
        <p className="mt-2 text-caption text-muted">{tk("admin.kpi.help")}</p>
      </section>

      {(pend.applications > 0 || pend.slugRequests > 0) && (
        <section aria-label={tk("admin.dash.pending")} className="grid gap-3 sm:grid-cols-2">
          {pend.applications > 0 && (
            <Link href="/admin/brands" className="card group flex items-center gap-4 border-warn px-5 py-4 transition-colors hover:bg-warn-soft">
              <span className="num text-title font-semibold leading-none text-warn">{pend.applications}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tk("admin.dash.applications")}</span>
                <span className="block text-meta text-ink-2">{tk("admin.dash.pendingHint")}</span>
              </span>
              <span aria-hidden className="text-ink-2 group-hover:text-ink">→</span>
            </Link>
          )}
          {pend.slugRequests > 0 && (
            <Link href="/admin/brands?tab=slug" className="card group flex items-center gap-4 border-warn px-5 py-4 transition-colors hover:bg-warn-soft">
              <span className="num text-title font-semibold leading-none text-warn">{pend.slugRequests}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tk("admin.dash.slugRequests")}</span>
                <span className="block text-meta text-ink-2">{tk("admin.dash.pendingHint")}</span>
              </span>
              <span aria-hidden className="text-ink-2 group-hover:text-ink">→</span>
            </Link>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-h5 font-bold">{tk("admin.queue")}</h2>
          <span className="num text-body text-ink-2">{queue.length}</span>
          {overdue > 0 && <span className="num text-body font-semibold text-crit">{tk("admin.queue.overdue", { n: overdue })}</span>}
        </div>
        <div className="mb-4">
          <FilterTabs variant="chips" label={tk("admin.queue.filterLabel")} active={owner}
            tabs={OWNERS.map((o) => ({ key: o, label: label(o), count: inOwner(o).length, href: withQuery("/admin", {}, { owner: o === "all" ? null : o }) }))} />
        </div>
        {rows.length === 0 ? (
          <ListEmpty filtered={owner !== "all" && queue.length > 0} resetHref="/admin" title={tk("admin.queue.empty")} help={tk("admin.dash.emptyHelp")} />
        ) : (
          <>
            <table className="table-ui">
              <thead>
                <tr>
                  <th>{tk("admin.queue.what")}</th>
                  <th>{tk("admin.requests.col.brand")}</th>
                  <th>{tk("admin.queue.status")}</th>
                  <th>{tk("admin.queue.owner")}</th>
                  <th className="text-right">{tk("admin.queue.due")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, SHOW).map((r) => (
                  <tr key={`${r.entity}-${r.id}`} className={lateRow(late(r))}>
                    <td className="min-w-0">
                      <Link href={r.href} className="font-medium hover:underline">{tk(`entity.${r.entity}`)}</Link>
                      {r.title && <div className="mt-0.5 max-w-md truncate text-caption text-muted">{r.title}</div>}
                    </td>
                    <td className="text-ink-2">{r.brand ?? "-"}</td>
                    <td>{PILL.has(r.entity)
                      ? <StatusPill entity={r.entity as "request_item" | "product" | "sample_request" | "order"} status={r.status} />
                      : <span className="text-meta text-ink-2">{tk(`status.${r.entity}.${r.status}`)}</span>}</td>
                    <td><span className={`text-meta ${r.owner_role === "ADMIN" ? "font-semibold text-ink" : r.owner_role === "CN" ? "text-warn" : "text-signature"}`}>{tk(`admin.queue.ownerRole.${r.owner_role}`)}</span></td>
                    <td className="text-right"><Due at={r.due_at} now={now} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > SHOW && <p className="num mt-2 text-caption text-muted">{tk("admin.queue.more", { n: SHOW })}</p>}
          </>
        )}
      </section>
    </div>
  );
}
