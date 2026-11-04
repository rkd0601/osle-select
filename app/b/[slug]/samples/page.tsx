import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandSamples } from "@/lib/db/brand/samples";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ListRow, ListTable, type ListQuery } from "../_ui/list";

/**
 * B-07 샘플 현황 목록 — 상태·수량·청구 예정(물류비 + 미회수 청구).
 * 탭: 전체 / 내 차례(입금·받기·피드백·회수 — 입금 신고 뒤엔 위아더 차례) / 진행 중 / 끝남.
 */
const DONE = ["closed", "cancelled"];
type Tab = "all" | "mine" | "active" | "done";

export default async function SamplesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListQuery> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { brand } = await requireBrandMember(slug);
  const rows = await listBrandSamples(brand.id);
  const base = `/b/${slug}/samples`;
  type Row = (typeof rows)[number];

  const mine = (r: Row) => r.owner_role === "BRAND" && !DONE.includes(r.status) && !(r.status === "awaiting_payment" && r.payment_reported_at);
  const dueOf = (r: Row) => (r.status === "delivered" ? r.feedback_due : r.status === "feedback_done" ? r.return_due : r.due_at);
  const inTab: Record<Tab, (r: Row) => boolean> = { all: () => true, mine, active: (r) => !DONE.includes(r.status), done: (r) => DONE.includes(r.status) };
  const tab: Tab = sp.tab && sp.tab in inTab ? (sp.tab as Tab) : "all";
  const shown = rows.filter(inTab[tab]).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.created_at.localeCompare(a.created_at));
  const tabs = (["all", "mine", "active", "done"] as const).map((k) => ({
    key: k, label: tk(k === "done" ? "list.tab.ended" : `list.tab.${k}`), href: withQuery(base, {}, { tab: k === "all" ? null : k }), count: rows.filter(inTab[k]).length, tone: k === "mine" ? ("brand" as const) : undefined,
  }));

  return (
    <div>
      <PageHeader
        eyebrow={tk("eyebrow.samples")}
        title={tk("sample.list.title")}
        count={rows.length}
        description={tk("sample.list.lead")}
        actions={<Link href={`${base}/new`} className="btn btn-primary">{tk("sample.list.new")}</Link>}
      >
        {rows.length > 0 && <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={tk("sample.list.empty")} help={tk("sample.list.emptyHelp")} action={{ href: `/b/${slug}/offers`, label: tk("sample.list.toOffers") }} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={tk("list.emptyFiltered")} help={tk("list.emptyFilteredHelp")} action={{ href: base, label: tk("list.reset") }} />
      ) : (
        <ListTable head={{ date: tk("list.col.created"), title: tk("list.col.sample"), qty: tk("list.col.qty"), amount: tk("list.col.billing"), due: tk("list.col.due"), status: tk("list.col.status") }}>
          {shown.map((r) => {
            const amount = r.logistics_fee_krw + r.charged;
            const due = mine(r) ? dueOf(r) : null;
            return (
              <ListRow
                key={r.id}
                href={`${base}/${r.id}`}
                mine={mine(r)}
                date={fmtDate(r.created_at)}
                title={tk("sample.detail.title", { date: fmtDate(r.created_at) })}
                sub={r.charged > 0 ? tk("sample.list.chargedSub", { n: krw(r.charged) }) : r.kr_tracking ? tk("sample.detail.tracking", { t: r.kr_tracking }) : null}
                qty={tk("sample.list.qty", { n: r.qty })}
                amount={amount > 0 ? `₩${krw(amount)}` : null}
                due={due}
                status={<StatusPill entity="sample_request" status={r.status} />}
              />
            );
          })}
        </ListTable>
      )}
    </div>
  );
}
