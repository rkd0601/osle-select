import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOrders } from "@/lib/db/brand/orders";
import { StatusDot } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { IndexRow, Rows } from "@/components/domain/index-row";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { bundleTitle, dueOf, TABS_FROM, type ListQuery } from "../_ui/list";

/**
 * B-09 발주 현황 목록 (디자인 v2): 인덱스 행 — 제목 `{첫 상품명} 외 n · {수량}장`, 메타(날짜 · 확정 금액 · 마감 · 미송), 상태 점, 내 기한.
 * 탭(전체 / 내 차례 / 진행 중 / 확정 이후 / 취소)은 행이 많을 때만.
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

  // 홈 블록과 같은 판정: 선금 신고 뒤엔 위아더 차례
  const mine = (r: Row) => r.owner_role === "BRAND" && !["report_done", "cancelled"].includes(r.status) && !(r.status === "deposit_pending" && r.deposit_reported_at);
  const inTab: Record<Tab, (r: Row) => boolean> = {
    all: () => true,
    mine,
    active: (r) => r.status !== "cancelled" && !AFTER.includes(r.status),
    confirmed: (r) => AFTER.includes(r.status),
    cancelled: (r) => r.status === "cancelled",
  };
  const showTabs = rows.length > TABS_FROM;
  const tab: Tab = showTabs && sp.tab && sp.tab in inTab ? (sp.tab as Tab) : "all";
  const shown = rows.filter(inTab[tab]).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.created_at.localeCompare(a.created_at));
  const tabs = (["all", "mine", "active", "confirmed", "cancelled"] as const).map((k) => ({
    key: k, label: tk(`list.tab.${k}`), href: withQuery(base, {}, { tab: k === "all" ? null : k }), count: rows.filter(inTab[k]).length,
  }));

  return (
    <div>
      <PageHeader
        eyebrow={tk("eyebrow.orders")}
        title={tk("order.list.title")}
        count={rows.length || null}
        actions={<Link href={`${base}/new`} className="btn">{tk("order.list.new")}</Link>}
      >
        {showTabs && <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={tk("order.list.empty")} action={{ href: `/b/${slug}/samples`, label: tk("order.list.toSamples") }} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={tk("list.emptyFiltered")} action={{ href: base, label: tk("list.reset") }} />
      ) : (
        <Rows>
          {shown.map((r) => {
            const d = mine(r) ? dueOf(r.due_at) : null;
            const meta = [
              fmtDate(r.created_at),
              r.total != null ? tk("order.list.total", { n: krw(r.total) }) : null,
              r.gb_close_date ? tk("order.list.gbClose", { date: fmtDate(r.gb_close_date) }) : null,
            ].filter(Boolean).join(" · ");
            return (
              <IndexRow
                key={r.id}
                href={`${base}/${r.id}`}
                mine={mine(r)}
                title={bundleTitle(r, r.qty, tk("order.detail.title", { date: fmtDate(r.created_at) }))}
                meta={<span className="num">{meta}{r.backorders > 0 && <span className="ml-2 text-warn">{tk("order.list.backorders", { n: r.backorders })}</span>}</span>}
                status={<StatusDot entity="order" status={r.status} />}
                due={d?.text}
                dueTone={d?.tone}
              />
            );
          })}
        </Rows>
      )}
    </div>
  );
}
