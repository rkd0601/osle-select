import Link from "next/link";
import { getAdminPendingCounts, getAdminQueue, getKpis, type QueueRow } from "@/lib/db/admin/dashboard";
import { PageHeader } from "@/components/domain/page-header";
import { KpiRow } from "@/components/domain/figure";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { StatusDot } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { ListEmpty, TBL, sp, type SearchParams } from "./_ui/ui";

/**
 * A-01 대시보드 (디자인 v2 §5): 날짜 눈썹 · "할 일 n · 지연 m" · 오른쪽 가입 신청 링크 → 기한 순 큐 표(대상 / 상태 점 / 차례 / 기한) → 룰 사이 지표(90일).
 * 레이아웃이 ADMIN을 검증한다. 가격·원가 숫자는 없다.
 */
const OWNERS = ["all", "ADMIN", "CN", "BRAND", "overdue"] as const;
type Owner = (typeof OWNERS)[number];
const DOT = new Set(["request_item", "product", "sample_request", "order"]);
const SHOW = 200;

/** 큐 행 제목: 코드 줄(종류 · 브랜드 · #번호/상품 코드) + 제목(첫 상품명 외 n · 수량) */
function rowTitle(r: QueueRow) {
  const code = [tk(`admin.queue.kind.${r.entity}`), r.brand, r.ref].filter(Boolean).join(" · ");
  const head = r.name ? (r.more > 0 ? tk("admin.queue.andMore", { name: r.name, n: r.more }) : r.name) : tk(`entity.${r.entity}`);
  const qty = r.qty ? tk(r.entity === "order" ? "admin.queue.pcs" : "admin.queue.pts", { n: r.qty }) : null;
  return { code, title: [head, qty].filter(Boolean).join(" · ") };
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const q = await searchParams;
  const owner: Owner = (OWNERS as readonly string[]).includes(sp(q.owner) ?? "") ? (sp(q.owner) as Owner) : "all";
  const [queue, k, pend] = await Promise.all([getAdminQueue(), getKpis(), getAdminPendingCounts()]);
  const now = new Date();
  const late = (r: QueueRow) => isOverdue(r.due_at, now);
  const inOwner = (o: Owner) => (o === "all" ? queue : o === "overdue" ? queue.filter(late) : queue.filter((r) => r.owner_role === o));
  const rows = inOwner(owner);
  const overdue = queue.filter(late).length;
  const label = (o: Owner) => (o === "all" ? tk("admin.ui.all") : o === "overdue" ? tk("admin.ui.overdue") : tk(`admin.queue.ownerRole.${o}`));
  const today = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(now);
  const pct = (v: number | null) => (v != null ? { value: v, unit: "%" } : { value: "—", dim: true });

  return (
    <div className="[&_.phead]:border-b-0 [&_.phead]:pb-0">
      <PageHeader
        eyebrow={today}
        title={
          <>
            {tk("admin.dash.todo")} <span className="num font-light">{queue.length}</span>
            {overdue > 0 && <span className="num ml-3 text-meta font-normal text-crit">· {tk("admin.dash.late", { n: overdue })}</span>}
          </>
        }
        actions={(pend.applications > 0 || pend.slugRequests > 0) && (
          <p className="meta flex flex-wrap items-baseline gap-x-2">
            {pend.applications > 0 && <span className="num">{tk("admin.dash.appsN", { n: pend.applications })} ·</span>}
            {pend.applications > 0 && <Link href="/admin/brands" className="link">{tk("admin.brands.list")}</Link>}
            {pend.slugRequests > 0 && <span className="num ml-3">{tk("admin.dash.slugN", { n: pend.slugRequests })} ·</span>}
            {pend.slugRequests > 0 && <Link href="/admin/brands?tab=slug" className="link">{tk("admin.brands.list")}</Link>}
          </p>
        )}
      />

      <section className="pt-2">
        <div className="mb-7">
          <FilterTabs label={tk("admin.queue.filterLabel")} active={owner}
            tabs={OWNERS.map((o) => ({ key: o, label: label(o), count: inOwner(o).length, tone: o === "overdue" ? "warn" : "default", href: withQuery("/admin", {}, { owner: o === "all" ? null : o }) }))} />
        </div>
        {rows.length === 0 ? (
          <ListEmpty filtered={owner !== "all" && queue.length > 0} resetHref="/admin" title={tk("admin.queue.empty")} />
        ) : (
          <>
            <table className={`${TBL} queue`}>
              <thead>
                <tr>
                  <th>{tk("admin.queue.what")}</th>
                  <th>{tk("admin.queue.status")}</th>
                  <th>{tk("admin.queue.owner")}</th>
                  <th className="r">{tk("admin.queue.due")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, SHOW).map((r) => {
                  const { code, title } = rowTitle(r);
                  const isLate = late(r);
                  return (
                    <tr key={`${r.entity}-${r.id}`}>
                      <td className="min-w-0">
                        <span className="code">{code}</span>
                        <Link href={r.href} className="font-medium hover:text-signature">{title}</Link>
                      </td>
                      <td>{DOT.has(r.entity)
                        ? <StatusDot entity={r.entity as "request_item" | "product" | "sample_request" | "order"} status={r.status} />
                        : <span className="st">{tk(`status.${r.entity}.${r.status}`)}</span>}</td>
                      <td className={`who ${r.owner_role === "CN" ? "cn" : ""}`}>
                        {[tk(`admin.queue.ownerRole.${r.owner_role}`), r.owner_role === "CN" ? r.assignee : null].filter(Boolean).join(" · ")}
                      </td>
                      <td className={`due whitespace-nowrap ${isLate ? "late" : ""}`}>
                        {fmtDate(r.due_at, "ko", true)}
                        {isLate && <span className="sr-only"> {tk("admin.ui.overdue")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > SHOW && <p className="num mt-3 text-caption text-muted">{tk("admin.queue.more", { n: SHOW })}</p>}
          </>
        )}
      </section>

      <section className="section">
        <div className="section-h border-b-0 pb-4"><h2>{tk("admin.kpi.title")}<span className="count num">{tk("admin.kpi.period")}</span></h2></div>
        <KpiRow items={[
          { label: tk("admin.kpi.matchRate"), ...pct(k.matchRate), sub: tk("admin.kpi.inspections", { n: k.inspections }) },
          { label: tk("admin.kpi.offerInterest"), ...pct(k.offerInterest) },
          { label: tk("admin.kpi.sampleToOrder"), ...pct(k.sampleToOrder) },
          { label: tk("admin.kpi.orderOverdue"), ...pct(k.orderOverdue) },
          { label: tk("admin.kpi.unreturned"), value: <Link href="/admin/samples?tab=overdue" className="hover:text-signature">{k.unreturned}</Link> },
        ]} />
        <p className="label mt-3">{tk("admin.kpi.help")}</p>
      </section>
    </div>
  );
}
