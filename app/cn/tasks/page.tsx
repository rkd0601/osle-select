import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/domain/empty-state";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";
import { ShipForm } from "./ship-form";
import { OrderShipForm, StockForm } from "./order-forms";

/**
 * C-05 처리 큐 (zh-CN, 디자인 v2 §5): 섹션(제목 + 건수) → 작업 블록(머리: 브랜드 라벨 · 번호 · 수량 / 기한) → 라인(상품명+코드 / ×수량 / 세그먼트) → 오른쪽 아래 버튼.
 * 발주 재고 확인 · 발주 출고(확정 뒤에만) · 샘플 출고 대기(입금 확인 전엔 버튼 없음) · 브랜드 반응·거절 사유(zh). 기한 순.
 * v_order_lines_cn: 본인 상품 라인만, KRW 단가 없음(원가와 합치면 마진이 역산된다).
 * v_sample_items_cn: 본인 상품 라인만, CN_VENDOR는 브랜드 마스킹(brand_label은 뷰 값 그대로), 브랜드 한국어 원문·주소 없음.
 */
const SOON_MS = 48 * 3600 * 1000;

export default async function CnTasks() {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/tasks");
  const L = u.locale;
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
  const total = stockTodo.length + shipTodo.length + toShip.length;

  const variant = (l: { color_zh: string | null; size_label: string | null }) => [l.color_zh, l.size_label].filter(Boolean).join(" / ");
  const lineName = (l: { name_zh: string | null; color_zh: string | null; size_label: string | null }) => [l.name_zh, variant(l)].filter(Boolean).join(" · ");
  const no = (id: string) => id.slice(0, 4).toUpperCase();
  const now = Date.now();
  const due = (d: string | null) => {
    if (!d) return null;
    const late = isOverdue(d);
    const soon = !late && new Date(d).getTime() - now <= SOON_MS;
    return (
      <span className="due" style={late ? { color: "var(--crit)" } : soon ? undefined : { color: "var(--muted)" }}>
        {late ? t(L, "common.overdue", { date: fmtDate(d, L, true) }) : t(L, "common.dueIn", { date: fmtDate(d, L, true) })}
      </span>
    );
  };
  const head = (parts: (string | null | undefined)[], d: string | null) => (
    <div className="head">
      <span className="t min-w-0">{parts.filter(Boolean).join(" · ")}</span>
      {due(d)}
    </div>
  );
  const shippedMark = <span className="st done">{t(L, "cn.order.shipped")}</span>;
  const section = (id: string, title: string, n: number, children: React.ReactNode) => (
    <section id={id} className="section scroll-mt-20" style={{ paddingTop: 32 }}>
      <div className="section-h" style={{ borderBottom: 0 }}><h2>{title}<span className="count">{n}</span></h2></div>
      {children}
    </section>
  );

  return (
    <div>
      <div className="phead" style={{ borderBottom: 0, paddingBottom: 0 }}>
        <h1 className="h1">{t(L, "cn.queue")} <span className="num" style={{ fontWeight: 300, color: "var(--muted)" }}>{total}</span></h1>
      </div>

      {total === 0 && feedback.length === 0 && <EmptyState title={t(L, "cn.tasks.allDone")} />}

      {stockTodo.length > 0 && section("stock", t(L, "cn.order.stockTodo"), stockTodo.length,
        stockTodo.map((g) => {
          const pending = g.lines.filter((l) => l.stock_result === "pending");
          const h = g.lines[0];
          return (
            <div key={g.id} className="task">
              {head([h.brand_label, t(L, "cn.task.order", { no: no(g.id) }), t(L, "cn.task.qty", { n: pending.reduce((a, l) => a + (l.expected_qty ?? 0), 0) })], h.due_at)}
              <StockForm orderId={g.id} locale={L} lines={pending.map((l) => ({ id: l.id, name: lineName(l), code: l.product_code, expected: l.expected_qty }))} />
            </div>
          );
        }),
      )}

      {shipTodo.length > 0 && section("order-ship", t(L, "cn.order.shipTodo"), shipTodo.length,
        shipTodo.map((g) => {
          const lines = g.lines.filter((l) => l.qty > 0);
          const h = g.lines[0];
          return (
            <div key={g.id} className="task">
              {head([h.brand_label, t(L, "cn.task.order", { no: no(g.id) }), t(L, "cn.task.qty", { n: lines.reduce((a, l) => a + l.qty, 0) })], h.due_at)}
              {lines.map((l) => (
                <div key={l.id} className="line">
                  <div className="n min-w-0">{lineName(l)}<small>{l.product_code}</small></div>
                  <span className="qty num">×{l.qty}</span>
                  {l.line_cn_shipped_at ? shippedMark : <span />}
                </div>
              ))}
              <OrderShipForm orderId={g.id} locale={L} />
            </div>
          );
        }),
      )}

      {toShip.length > 0 && section("sample-ship", t(L, "cn.tasks.toShip"), toShip.length,
        toShip.map((g) => {
          const h = g.items[0];
          const ready = h.request_status === "requested";
          return (
            <div key={g.id} className="task">
              {head([h.brand_label, t(L, "cn.task.sample", { no: no(g.id) }), t(L, "cn.task.qty", { n: g.items.reduce((a, i) => a + i.qty, 0) })], h.due_at)}
              {g.items.map((i) => (
                <div key={i.id} className="line">
                  <div className="n min-w-0">{lineName(i)}<small>{i.product_code}</small></div>
                  <span className="qty num">×{i.qty}</span>
                  {i.item_cn_shipped_at ? shippedMark : <span />}
                </div>
              ))}
              {ready ? <ShipForm sampleId={g.id} locale={L} /> : <div className="foot"><p className="text-meta text-warn">{t(L, "cn.tasks.waitPayment")}</p></div>}
            </div>
          );
        }),
      )}

      {feedback.length > 0 && section("feedback", t(L, "cn.tasks.feedback"), feedback.length,
        <div className="task">
          {feedback.map((i) => (
            <div key={i.id} className="line">
              <div className="n min-w-0">
                {lineName(i)}<small>{i.product_code}</small>
                {i.feedback_note_zh && <p className="mt-1 text-meta text-ink-2">{i.feedback_note_zh}</p>}
              </div>
              <span />
              <span className={`st whitespace-normal ${i.feedback === "interested" ? "done" : i.feedback === "declined" ? "warn" : "wait"}`}>
                {t(L, `status.offer.${i.feedback}`)}{i.feedback_reason && ` · ${t(L, `decline.${i.feedback_reason}`)}`}
              </span>
            </div>
          ))}
        </div>,
      )}
    </div>
  );
}
