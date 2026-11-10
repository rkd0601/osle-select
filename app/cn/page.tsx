import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyItems } from "@/lib/db/cn/requests";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { IndexRow } from "@/components/domain/index-row";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";
import { CATEGORY_ZH } from "@/lib/codes";
import { listMyUnread } from "@/lib/db/notifications";
import { isUnseen, unseenPaths } from "@/lib/unseen";
import { UpdatesPanel } from "@/components/domain/updates-panel";

const TODO = ["assigned", "sourcing"];
const OFFERED = ["offered", "selected"];
const SOON_MS = 48 * 3600 * 1000;
const FILTERS = ["all", "todo", "soon", "overdue", "offered", "closed"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * C-01 내 요청 항목 (v_request_items_cn: VENDOR는 브랜드명·희망 단가 마스킹 — brand_label은 뷰 값 그대로). 기한 순.
 * 디자인 v2: 제목 + 건수 → (처리 큐가 있으면) 금색 룰 한 줄 → 탭(건수 muted) + 검색 → 인덱스 행(기한 warn/crit).
 */
export default async function CnHome({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
  const catLabel = (c: string | null | undefined) => (c ? (L === "ko" ? c : CATEGORY_ZH[c] ?? c) : null); // 중국 화면엔 카테고리도 중국어 (버튼 점검 11-10)
  const sp = await searchParams;
  const f: Filter = (FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as Filter) : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  // 처리 큐 요약 — 홈만 보고 재고 확인·출고를 놓치지 않게 (2026-11-04 UX 2차). 뷰는 본인 상품 라인만.
  const [items, { data: ol }, { data: si }, unread] = await Promise.all([
    listMyItems(),
    supabase.from("v_order_lines_cn").select("order_id, order_status, stock_result, qty, line_cn_shipped_at").in("order_status", ["stock_checking", "confirmed"]).limit(500),
    supabase.from("v_sample_items_cn").select("sample_request_id, request_status, item_cn_shipped_at").in("request_status", ["requested", "awaiting_payment"]).limit(300),
    listMyUnread(),
  ]);
  const unseen = unseenPaths(unread); // 새 소식 칩·묶음 (사이트 수정 8)
  const stockTodo = new Set((ol ?? []).filter((l) => l.order_status === "stock_checking" && l.stock_result === "pending").map((l) => l.order_id)).size;
  const shipTodo = new Set((ol ?? []).filter((l) => l.order_status === "confirmed" && !l.line_cn_shipped_at && (l.qty ?? 0) > 0).map((l) => l.order_id)).size;
  const sampleTodo = new Set((si ?? []).filter((r) => !r.item_cn_shipped_at).map((r) => r.sample_request_id)).size;
  const queue: [string, number][] = [["cn.order.stockTodo", stockTodo], ["cn.order.shipTodo", shipTodo], ["cn.tasks.toShip", sampleTodo]];
  const queueTotal = stockTodo + shipTodo + sampleTodo;

  const now = Date.now();
  const isTodo = (s: string) => TODO.includes(s);
  const late = (it: { status: string; due_at: string | null }) => isTodo(it.status) && isOverdue(it.due_at);
  const soon = (it: { status: string; due_at: string | null }) => {
    if (!isTodo(it.status) || !it.due_at) return false;
    const d = new Date(it.due_at).getTime() - now;
    return d >= 0 && d <= SOON_MS;
  };
  const match: Record<Filter, (it: (typeof items)[number]) => boolean> = {
    all: () => true,
    todo: (it) => isTodo(it.status),
    soon,
    overdue: late,
    offered: (it) => OFFERED.includes(it.status),
    closed: (it) => !isTodo(it.status) && !OFFERED.includes(it.status),
  };
  const counts = Object.fromEntries(FILTERS.map((k) => [k, items.filter(match[k]).length])) as Record<Filter, number>;
  const searched = q
    ? items.filter((it) => [`#${it.seq}`, String(it.seq), it.description_zh, it.brand_label, it.category].some((v) => v && String(v).toLowerCase().includes(q)))
    : items;
  const rows = searched.filter(match[f]);
  const href = (patch: Record<string, string | undefined | null>) => withQuery("/cn", { f: f === "all" ? undefined : f, q: sp.q }, patch);

  return (
    <div>
      <PageHeader
        title={t(L, "cn.items")}
        count={items.length}
        actions={<Link href="/cn/products/new" className="btn sec sm min-h-10">{t(L, "cn.nav.new")}</Link>}
      />

      <UpdatesPanel className="mb-8" title={t(L, "cn.updates.title")} total={unread.length} moreHref="/cn/notifications" moreLabel={t(L, "cn.updates.more")}
        items={unread.slice(0, 5).map((n) => ({ id: n.id, title: n.title, href: n.link_path, at: fmtDate(n.created_at, L, true) }))} />

      {queueTotal > 0 && (
        <div className="mb-8 border-t border-line">
          <IndexRow
            href="/cn/tasks"
            mine
            title={<>{t(L, "cn.queue")} <span className="num ml-1" style={{ fontWeight: 300 }}>{queueTotal}</span></>}
            meta={queue.filter(([, n]) => n > 0).map(([k, n]) => `${t(L, k)} ${n}`).join(" · ")}
          />
        </div>
      )}

      <FilterTabs
        label={t(L, "cn.filter.label")}
        active={f}
        tabs={FILTERS.map((k) => ({ key: k, label: t(L, `cn.filter.${k}`), href: href({ f: k === "all" ? undefined : k }), count: counts[k] }))}
      />
      <SearchBox placeholder={t(L, "cn.home.search")} label={t(L, "cn.search.label")} className="mt-4 sm:max-w-xs" />

      {items.length === 0 ? (
        <EmptyState title={t(L, "cn.item.empty")} />
      ) : rows.length === 0 ? (
        <EmptyState compact title={t(L, "cn.filter.empty")} action={{ href: "/cn", label: t(L, "cn.filter.reset") }} />
      ) : (
        <ul className="mt-6 border-t border-line">
          {rows.map((it) => {
            const overdue = late(it);
            return (
              <li key={it.id} className="flex flex-col border-b border-line sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1 [&>.row]:border-b-0">
                  <IndexRow
                    href={`/cn/items/${it.id}`}
                    kicker={`#${it.seq}`}
                    badge={isUnseen(unseen, `/cn/items/${it.id}`) ? t(L, "cn.updates.chip") : null}
                    title={it.description_zh ?? t(L, "cn.item.noZh")}
                    meta={[it.brand_label, catLabel(it.category), it.expected_qty_range ? t(L, `qtyRange.${it.expected_qty_range}`) : null].filter(Boolean).join(" · ")}
                    status={<StatusPill entity="request_item" status={it.status} locale={L} />}
                    due={overdue ? t(L, "common.overdue", { date: fmtDate(it.due_at, L, true) }) : t(L, "common.dueIn", { date: fmtDate(it.due_at, L, true) })}
                    dueTone={overdue ? "crit" : soon(it) ? "warn" : "default"}
                  />
                </div>
                {isTodo(it.status) && (
                  <Link href={`/cn/products/new?item=${it.id}`} className="mb-3 inline-flex min-h-10 shrink-0 items-center self-start sm:mb-0 sm:self-auto">
                    <span className="link">{t(L, "cn.item.addProduct")}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
