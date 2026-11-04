import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";
import { ShipForm } from "./ship-form";
import { OrderShipForm, StockForm } from "./order-forms";

/**
 * C-05 처리 큐 (zh-CN): 발주 재고 확인 · 발주 출고(확정 뒤에만) · 샘플 출고 대기(입금 확인 전엔 버튼 없음) · 브랜드 반응·거절 사유(zh). 기한 순.
 * v_order_lines_cn: 본인 상품 라인만, KRW 단가 없음(원가와 합치면 마진이 역산된다).
 * v_sample_items_cn: 본인 상품 라인만, CN_VENDOR는 브랜드 마스킹, 브랜드 한국어 원문·주소 없음.
 */
const TABS = ["all", "stock", "orderShip", "sampleShip", "feedback"] as const;
type Tab = (typeof TABS)[number];

export default async function CnTasks({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/tasks");
  const L = u.locale;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "all";
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_sample_items_cn")
    .select("id, sample_request_id, qty, status, feedback, feedback_reason, feedback_note_zh, request_status, payment_required, payment_confirmed_at, cn_tracking, cn_shipped_at, due_at, requested_at, product_code, name_zh, color_zh, size_label, brand_label, item_cn_shipped_at, item_cn_tracking")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);
  const rows = data ?? [];
  const groups = [...new Set(rows.map((r) => r.sample_request_id))].map((id) => ({ id, items: rows.filter((r) => r.sample_request_id === id) }));
  // 내 항목 중 아직 출고 안 한 것이 있는 요청서 (다른 원청 항목은 v_sample_items_cn에 애초에 없다)
  const toShip = groups.filter((g) => ["requested", "awaiting_payment"].includes(g.items[0].request_status) && g.items.some((i) => !i.item_cn_shipped_at));
  const feedback = rows.filter((r) => r.feedback);
  const { data: ol } = await supabase
    .from("v_order_lines_cn")
    .select("id, order_id, expected_qty, qty, stock_result, confirmed_qty, order_status, due_at, gb_close_date, ordered_at, product_code, name_zh, color_zh, size_label, brand_label, line_cn_shipped_at")
    .in("order_status", ["stock_checking", "confirmed"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);
  const orderGroups = [...new Set((ol ?? []).map((l) => l.order_id))].map((id) => ({ id, lines: (ol ?? []).filter((l) => l.order_id === id) }));
  const stockTodo = orderGroups.filter((g) => g.lines[0].order_status === "stock_checking" && g.lines.some((l) => l.stock_result === "pending"));
  const shipTodo = orderGroups.filter((g) => g.lines[0].order_status === "confirmed" && g.lines.some((l) => !l.line_cn_shipped_at && l.qty > 0));
  const lineLabel = (l: { product_code: string | null; name_zh: string | null; color_zh: string | null; size_label: string | null }) =>
    `${l.product_code ?? ""} ${l.name_zh ?? ""} · ${[l.color_zh, l.size_label].filter(Boolean).join(" / ")}`;
  const due = (d: string | null) => (
    <span className={`num text-meta ${isOverdue(d) ? "font-semibold text-crit" : "text-ink-2"}`}>
      {isOverdue(d) ? t(L, "common.overdue", { date: fmtDate(d, L, true) }) : t(L, "common.dueIn", { date: fmtDate(d, L, true) })}
    </span>
  );
  const cardHead = (left: React.ReactNode, right: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/60 px-4 py-2.5">
      <span className="min-w-0 text-meta text-ink-2">{left}</span>
      <span className="flex items-center gap-2">{right}</span>
    </div>
  );
  const head = (h: { brand_label: string | null; ordered_at: string | null; due_at: string | null; gb_close_date: string | null }) =>
    cardHead(
      <><span className="font-semibold text-ink">{h.brand_label}</span> · <span className="num">{fmtDate(h.ordered_at, L)}</span>{h.gb_close_date ? <> · <span className="num">{t(L, "cn.order.gbClose", { date: fmtDate(h.gb_close_date, L) })}</span></> : null}</>,
      due(h.due_at),
    );
  const counts: Record<Tab, number> = { all: stockTodo.length + shipTodo.length + toShip.length, stock: stockTodo.length, orderShip: shipTodo.length, sampleShip: toShip.length, feedback: feedback.length };
  const label: Record<Tab, string> = { all: t(L, "cn.filter.all"), stock: t(L, "cn.order.stockTodo"), orderShip: t(L, "cn.order.shipTodo"), sampleShip: t(L, "cn.tasks.toShip"), feedback: t(L, "cn.tasks.feedback") };
  const show = (k: Tab) => tab === "all" || tab === k;
  const section = (k: Exclude<Tab, "all">, children: React.ReactNode) => (
    <section key={k}>
      {tab === "all" && (
        <h2 className="mb-3 flex items-baseline gap-2 border-b border-line pb-2 text-h5 font-semibold">
          {label[k]} <span className={`num text-body ${counts[k] && k !== "feedback" ? "text-warn" : "text-ink-2"}`}>{counts[k]}</span>
        </h2>
      )}
      {counts[k] === 0 ? (tab === "all" ? <p className="py-2 text-body text-ink-2">{t(L, "cn.tasks.none")}</p> : <EmptyState compact title={t(L, "cn.tasks.none")} help={t(L, "cn.tasks.empty.help")} />) : children}
    </section>
  );

  return (
    <div>
      <PageHeader eyebrow={t(L, "cn.title")} title={t(L, "cn.queue")} count={counts.all} description={t(L, "cn.tasks.desc")}>
        <FilterTabs
          label={t(L, "cn.filter.label")}
          active={tab}
          tabs={TABS.map((k) => ({ key: k, label: label[k], href: k === "all" ? "/cn/tasks" : `/cn/tasks?tab=${k}`, count: counts[k], tone: k !== "all" && k !== "feedback" ? "warn" : undefined }))}
        />
      </PageHeader>
      {tab === "all" && counts.all === 0 && (
        <p className="mb-6 rounded-ui border border-signature/30 bg-signature-soft px-4 py-3 text-body font-medium text-signature-ink">✓ {t(L, "cn.tasks.allDone")}</p>
      )}
      <div className="space-y-10">
        {show("stock") && section("stock",
          <ul className="space-y-3">
            {stockTodo.map((g) => (
              <li key={g.id} className="card overflow-hidden text-body">
                {head(g.lines[0])}
                <div className="px-4 py-3">
                  <StockForm orderId={g.id} locale={L} lines={g.lines.filter((l) => l.stock_result === "pending").map((l) => ({ id: l.id, label: lineLabel(l), expected: l.expected_qty }))} />
                </div>
              </li>
            ))}
          </ul>,
        )}
        {show("orderShip") && section("orderShip",
          <ul className="space-y-3">
            {shipTodo.map((g) => (
              <li key={g.id} className="card overflow-hidden text-body">
                {head(g.lines[0])}
                <ul className="divide-y divide-line px-4">
                  {g.lines.filter((l) => l.qty > 0).map((l) => (
                    <li key={l.id} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0">{lineLabel(l)}</span>
                      <span className="num shrink-0 font-semibold">×{l.qty}{l.line_cn_shipped_at ? <span className="ml-1 font-normal text-signature">· {t(L, "cn.order.shipped")}</span> : null}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-3"><OrderShipForm orderId={g.id} locale={L} /></div>
              </li>
            ))}
          </ul>,
        )}
        {show("sampleShip") && section("sampleShip",
          <ul className="space-y-3">
            {toShip.map((g) => {
              const h = g.items[0];
              const ready = h.request_status === "requested";
              return (
                <li key={g.id} className="card overflow-hidden text-body">
                  {cardHead(
                    <><span className="font-semibold text-ink">{h.brand_label}</span> · <span className="num">{fmtDate(h.requested_at, L)}</span></>,
                    <>{due(h.due_at)}<StatusPill entity="sample_request" status={h.request_status} locale={L} /></>,
                  )}
                  <ul className="divide-y divide-line px-4">
                    {g.items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3 py-2">
                        <span className="min-w-0">{i.product_code} {i.name_zh} · {[i.color_zh, i.size_label].filter(Boolean).join(" / ")}</span>
                        <span className="num shrink-0 font-semibold">×{i.qty}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line px-4 py-3">{ready ? <ShipForm sampleId={g.id} locale={L} /> : <p className="rounded-ui bg-warn-soft px-3 py-2 text-meta text-warn">{t(L, "cn.tasks.waitPayment")}</p>}</div>
                </li>
              );
            })}
          </ul>,
        )}
        {show("feedback") && section("feedback",
          <ul className="card divide-y divide-line text-body">
            {feedback.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0"><span className="font-semibold">{i.product_code} {i.name_zh}</span> <span className="text-ink-2">· {[i.color_zh, i.size_label].filter(Boolean).join(" / ")}</span></span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${i.feedback === "interested" ? "bg-signature-soft text-signature-ink" : i.feedback === "declined" ? "bg-warn-soft text-warn" : "bg-sand text-ink-2"}`}>
                    {t(L, `status.offer.${i.feedback}`)}{i.feedback_reason && ` · ${t(L, `decline.${i.feedback_reason}`)}`}
                  </span>
                </div>
                {i.feedback_note_zh && <p className="mt-1.5 border-l-2 border-line-strong pl-2 text-meta text-ink-2">{i.feedback_note_zh}</p>}
              </li>
            ))}
          </ul>,
        )}
      </div>
    </div>
  );
}
