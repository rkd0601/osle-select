import Link from "next/link";
import { getAdminPendingCounts, getAdminQueue, getKpis, type QueueRow } from "@/lib/db/admin/dashboard";
import { PageHeader } from "@/components/domain/page-header";
import { KpiRow } from "@/components/domain/figure";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { StatusDot } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { ListEmpty, sp, type SearchParams } from "./_ui/ui";
import { GridCols } from "@/components/domain/grid-cols";
import { isNew, sortMode, sortTodo, type SortMode } from "@/lib/admin-recency";
import { SortToggle } from "./_ui/sort-toggle";
import { listMyUnread } from "@/lib/db/notifications";
import { isUnseen, unseenPaths } from "@/lib/unseen";
import { UpdatesPanel } from "@/components/domain/updates-panel";

/**
 * A-01 대시보드 (디자인 v2 §5): 날짜 눈썹 · "할 일 n · 지연 m" · 오른쪽 가입 신청 링크 → 큐 표(대상 / 상태 점 / 차례 / 기한) → 룰 사이 지표(90일).
 * 큐 정렬(§0-l P1, d-29): 기본 = 지연 맨 위 + 최근 활동순(새로 들어온 요청이 묻히지 않게), `?sort=due` = 기한순. 24시간 안에 생긴 행은 "새" 칩.
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
  const sort: SortMode = sortMode(sp(q.sort));
  const [queue, k, pend, unread] = await Promise.all([getAdminQueue(), getKpis(), getAdminPendingCounts(), listMyUnread()]);
  const unseen = unseenPaths(unread); // 읽지 않은 알림이 가리키는 화면 → "새 소식" 칩 (사이트 수정 7)
  const now = new Date();
  const late = (r: QueueRow) => isOverdue(r.due_at, now);
  const inOwner = (o: Owner) => (o === "all" ? queue : o === "overdue" ? queue.filter(late) : queue.filter((r) => r.owner_role === o));
  const rows = sortTodo(inOwner(owner), sort, now);
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

      <UpdatesPanel className="mb-8" title={tk("admin.updates.title")} total={unread.length} moreHref="/admin/notifications" moreLabel={tk("admin.updates.more")}
        items={unread.slice(0, 5).map((n) => ({ id: n.id, title: n.title, href: n.link_path, at: fmtDate(n.created_at, "ko", true) }))} />

      <section className="pt-2">
        <div className="mb-7 flex items-end">
          <div className="min-w-0 flex-1">
          <FilterTabs label={tk("admin.queue.filterLabel")} active={owner}
            tabs={OWNERS.map((o) => ({ key: o, label: label(o), count: inOwner(o).length, tone: o === "overdue" ? "warn" : "default", href: withQuery("/admin", { sort: sort === "due" ? "due" : undefined }, { owner: o === "all" ? null : o }) }))} />
          </div>
          <SortToggle active={sort} hrefFor={(m) => withQuery("/admin", { owner: owner === "all" ? undefined : owner }, { sort: m === "due" ? "due" : null })} />
        </div>
        {rows.length === 0 ? (
          <ListEmpty filtered={owner !== "all" && queue.length > 0} resetHref="/admin" title={tk("admin.queue.empty")} />
        ) : (
          <>
            {/* L12: 대상 6 · 상태 2 · 차례 2 · 기한 2 칸 (.tbl.gridt + GridCols → 열 경계가 12칸 선 위) */}
            <table className="tbl gridt queue">
              <GridCols spans={[6, 2, 2, 2]} />
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
                      <td className="ell" title={title}>
                        <span className="code">{code}</span>
                        {isNew(r.created_at, now) ? <span className="chip gold mr-2 align-middle">{tk("admin.todo.new")}</span>
                          : isUnseen(unseen, r.href) && <span className="chip gold mr-2 align-middle">{tk("admin.todo.updated")}</span>}
                        <Link href={r.href} className="font-medium hover:text-signature">{title}</Link>
                      </td>
                      <td>{DOT.has(r.entity)
                        ? <StatusDot entity={r.entity as "request_item" | "product" | "sample_request" | "order"} status={r.status} />
                        : <span className="st">{tk(`status.${r.entity}.${r.status}`)}</span>}</td>
                      <td className={`who ell ${r.owner_role === "CN" ? "cn" : ""}`}>
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
