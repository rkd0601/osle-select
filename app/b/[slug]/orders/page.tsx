import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOrders } from "@/lib/db/brand/orders";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ListRow, ListTable, type ListQuery } from "../_ui/list";

/**
 * B-09 발주 현황 목록 — 상태(누구 차례) · 수량 · 확정 금액 · 미송 표시.
 * 탭: 전체 / 내 차례(선금·수량 확정·최종 견적 동의·받기·검수 보고) / 진행 중(확정 전) / 확정 이후 / 취소.
 */
const AFTER = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered", "report_done"];
type Tab = "all" | "mine" | "active" | "confirmed" | "cancelled";

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListQuery> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { brand } = await requireBrandMember(slug);
  const rows = await listBrandOrders(brand.id);
  const base = `/b/${slug}/orders`;
  type Row = (typeof rows)[number];

  // 홈 카드와 같은 판정: 선금 신고 뒤엔 위아더 차례
  const mine = (r: Row) => r.owner_role === "BRAND" && !["report_done", "cancelled"].includes(r.status) && !(r.status === "deposit_pending" && r.deposit_reported_at);
  const inTab: Record<Tab, (r: Row) => boolean> = {
    all: () => true,
    mine,
    active: (r) => r.status !== "cancelled" && !AFTER.includes(r.status),
    confirmed: (r) => AFTER.includes(r.status),
    cancelled: (r) => r.status === "cancelled",
  };
  const tab: Tab = sp.tab && sp.tab in inTab ? (sp.tab as Tab) : "all";
  const shown = rows.filter(inTab[tab]).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.created_at.localeCompare(a.created_at));
  const tabs = (["all", "mine", "active", "confirmed", "cancelled"] as const).map((k) => ({
    key: k, label: tk(`list.tab.${k}`), href: withQuery(base, {}, { tab: k === "all" ? null : k }), count: rows.filter(inTab[k]).length, tone: k === "mine" ? ("brand" as const) : undefined,
  }));
  const confirmedTotal = rows.filter((r) => AFTER.includes(r.status)).reduce((s, r) => s + (r.total ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow={tk("eyebrow.orders")}
        title={tk("order.list.title")}
        count={rows.length}
        description={confirmedTotal > 0 ? tk("order.list.leadTotal", { n: krw(confirmedTotal) }) : tk("order.list.lead")}
        actions={<Link href={`${base}/new`} className="btn btn-primary">{tk("order.list.new")}</Link>}
      >
        {rows.length > 0 && <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={tk("order.list.empty")} help={tk("order.list.emptyHelp")} action={{ href: `/b/${slug}/samples`, label: tk("order.list.toSamples") }} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={tk("list.emptyFiltered")} help={tk("list.emptyFilteredHelp")} action={{ href: base, label: tk("list.reset") }} />
      ) : (
        <ListTable head={{ date: tk("list.col.created"), title: tk("list.col.order"), qty: tk("list.col.qty"), amount: tk("list.col.total"), due: tk("list.col.due"), status: tk("list.col.status") }}>
          {shown.map((r) => {
            const sub = [
              r.gb_close_date ? tk("order.list.gbClose", { date: fmtDate(r.gb_close_date) }) : null,
              r.delivery_promise_date ? tk("order.list.delivery", { date: fmtDate(r.delivery_promise_date) }) : null,
            ].filter(Boolean).join(" · ");
            return (
              <ListRow
                key={r.id}
                href={`${base}/${r.id}`}
                mine={mine(r)}
                date={fmtDate(r.created_at)}
                title={tk("order.detail.title", { date: fmtDate(r.created_at) })}
                sub={(sub || r.backorders > 0) ? (
                  <>
                    <span className="num">{sub}</span>
                    {r.backorders > 0 && <span className="ml-2 font-semibold text-warn">{tk("order.list.backorders", { n: r.backorders })}</span>}
                  </>
                ) : null}
                qty={tk("order.list.qty", { n: r.qty })}
                amount={r.total != null ? `₩${krw(r.total)}` : null}
                due={mine(r) ? r.due_at : null}
                status={<StatusPill entity="order" status={r.status} />}
              />
            );
          })}
        </ListTable>
      )}
    </div>
  );
}
