import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyItems } from "@/lib/db/cn/requests";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { StatGrid } from "@/components/domain/stat";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";

const TODO = ["assigned", "sourcing"];
const OFFERED = ["offered", "selected"];
const SOON_MS = 48 * 3600 * 1000;
const FILTERS = ["all", "todo", "soon", "overdue", "offered", "closed"] as const;
type Filter = (typeof FILTERS)[number];

/** C-01 내 요청 항목 (v_request_items_cn: VENDOR는 브랜드명·희망 단가 마스킹 — brand_label은 뷰 값 그대로). 기한 순. */
export default async function CnHome({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
  const sp = await searchParams;
  const f: Filter = (FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as Filter) : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  // 처리 큐 요약 — 홈만 보고 재고 확인·출고를 놓치지 않게 (2026-11-04 UX 2차). 뷰는 본인 상품 라인만.
  const [items, { data: ol }, { data: si }] = await Promise.all([
    listMyItems(),
    supabase.from("v_order_lines_cn").select("order_id, order_status, stock_result, qty, line_cn_shipped_at").in("order_status", ["stock_checking", "confirmed"]).limit(500),
    supabase.from("v_sample_items_cn").select("sample_request_id, request_status, item_cn_shipped_at").in("request_status", ["requested", "awaiting_payment"]).limit(300),
  ]);
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
        eyebrow={t(L, "cn.title")}
        title={t(L, "cn.items")}
        count={items.length}
        description={t(L, "cn.home.desc")}
        actions={<Link href="/cn/products/new" className="btn btn-accent min-h-10">{t(L, "cn.nav.new")}</Link>}
      />

      <StatGrid
        items={[
          { label: t(L, "cn.home.stat.todo"), value: counts.todo, href: href({ f: "todo" }), tone: counts.todo ? "brand" : "default" },
          { label: t(L, "cn.home.stat.soon"), value: counts.soon, href: href({ f: "soon" }), tone: counts.soon ? "warn" : "default" },
          { label: t(L, "cn.home.stat.overdue"), value: counts.overdue, href: href({ f: "overdue" }), tone: counts.overdue ? "crit" : "default" },
          {
            label: t(L, "cn.home.stat.queue"), value: queueTotal, href: "/cn/tasks", tone: queueTotal ? "warn" : "default",
            hint: queueTotal ? queue.filter(([, n]) => n > 0).map(([k, n]) => `${t(L, k)} ${n}`).join(" · ") : t(L, "cn.home.stat.queueHint"),
          },
        ]}
      />

      <div className="mt-6 space-y-3">
        <FilterTabs
          label={t(L, "cn.filter.label")}
          active={f}
          tabs={FILTERS.map((k) => ({ key: k, label: t(L, `cn.filter.${k}`), href: href({ f: k === "all" ? undefined : k }), count: counts[k], tone: k === "overdue" || k === "soon" ? "warn" : undefined }))}
        />
        <SearchBox placeholder={t(L, "cn.home.search")} label={t(L, "cn.search.label")} className="md:max-w-sm" />
      </div>

      {items.length === 0 ? (
        <div className="mt-4"><EmptyState title={t(L, "cn.item.empty")} help={t(L, "cn.item.empty.help")} /></div>
      ) : rows.length === 0 ? (
        <div className="mt-4"><EmptyState compact title={t(L, "cn.filter.empty")} action={{ href: "/cn", label: t(L, "cn.filter.reset") }} /></div>
      ) : (
        <ul className="mt-4 space-y-2 md:space-y-0 md:divide-y md:divide-line md:border-y md:border-line">
          {rows.map((it) => {
            const overdue = late(it);
            const dueSoon = soon(it);
            return (
              <li key={it.id} className="flex flex-col rounded-ui border border-line bg-surface md:flex-row md:items-center md:rounded-none md:border-0">
                <Link href={`/cn/items/${it.id}`} className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 hover:bg-paper md:flex-row md:items-center md:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="num shrink-0 text-meta font-semibold text-ink-2">#{it.seq}</span>
                      <span className="line-clamp-2 text-lead font-medium md:truncate">{it.description_zh ?? t(L, "cn.item.noZh")}</span>
                    </div>
                    <div className="mt-1 text-meta text-ink-2">
                      {[it.brand_label, it.category, it.expected_qty_range ? t(L, `qtyRange.${it.expected_qty_range}`) : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 md:justify-end">
                    <span className={`num text-meta ${overdue ? "font-semibold text-crit" : dueSoon ? "font-semibold text-warn" : "text-ink-2"}`}>
                      {overdue ? t(L, "common.overdue", { date: fmtDate(it.due_at, L, true) }) : t(L, "common.dueIn", { date: fmtDate(it.due_at, L, true) })}
                    </span>
                    <StatusPill entity="request_item" status={it.status} locale={L} />
                  </div>
                </Link>
                {isTodo(it.status) && (
                  <div className="border-t border-line px-4 py-2 md:border-0 md:py-0 md:pl-0">
                    <Link href={`/cn/products/new?item=${it.id}`} className="btn btn-secondary btn-sm min-h-10 w-full md:w-auto">{t(L, "cn.item.addProduct")}</Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
