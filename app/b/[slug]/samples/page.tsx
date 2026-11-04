import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBrandSamples } from "@/lib/db/brand/samples";
import { StatusDot } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { IndexRow, Rows } from "@/components/domain/index-row";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { bundleTitle, dueOf, TABS_FROM, type ListQuery } from "../_ui/list";

/**
 * B-07 샘플 현황 목록 (디자인 v2): 인덱스 행 — 제목 `{첫 상품명} 외 n · {수량}장`, 메타(날짜 · 청구 예정), 상태 점, 내 기한.
 * 탭(전체 / 내 차례 / 진행 중 / 끝남)은 행이 많을 때만. 내 차례 = 입금·받기·피드백·회수(입금 신고 뒤엔 위아더 차례).
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
  const dueAt = (r: Row) => (r.status === "delivered" ? r.feedback_due : r.status === "feedback_done" ? r.return_due : r.due_at);
  const inTab: Record<Tab, (r: Row) => boolean> = { all: () => true, mine, active: (r) => !DONE.includes(r.status), done: (r) => DONE.includes(r.status) };
  const showTabs = rows.length > TABS_FROM;
  const tab: Tab = showTabs && sp.tab && sp.tab in inTab ? (sp.tab as Tab) : "all";
  const shown = rows.filter(inTab[tab]).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.created_at.localeCompare(a.created_at));
  const tabs = (["all", "mine", "active", "done"] as const).map((k) => ({
    key: k, label: tk(k === "done" ? "list.tab.ended" : `list.tab.${k}`), href: withQuery(base, {}, { tab: k === "all" ? null : k }), count: rows.filter(inTab[k]).length,
  }));

  return (
    <div>
      <PageHeader
        eyebrow={tk("eyebrow.samples")}
        title={tk("sample.list.title")}
        count={rows.length || null}
        actions={<Link href={`${base}/new`} className="btn">{tk("sample.list.new")}</Link>}
      >
        {showTabs && <FilterTabs tabs={tabs} active={tab} label={tk("list.tabsLabel")} />}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={tk("sample.list.empty")} action={{ href: `/b/${slug}/offers`, label: tk("sample.list.toOffers") }} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={tk("list.emptyFiltered")} action={{ href: base, label: tk("list.reset") }} />
      ) : (
        <Rows>
          {shown.map((r) => {
            const amount = r.logistics_fee_krw + r.charged;
            const d = mine(r) ? dueOf(dueAt(r)) : null;
            const meta = [
              fmtDate(r.created_at),
              amount > 0 ? tk("sample.list.billing", { n: krw(amount) }) : null,
              r.kr_tracking ? tk("sample.detail.tracking", { t: r.kr_tracking }) : null,
            ].filter(Boolean).join(" · ");
            return (
              <IndexRow
                key={r.id}
                href={`${base}/${r.id}`}
                mine={mine(r)}
                title={bundleTitle(r, r.qty, tk("sample.detail.title", { date: fmtDate(r.created_at) }))}
                meta={<span className="num">{meta}</span>}
                status={<StatusDot entity="sample_request" status={r.status} />}
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
