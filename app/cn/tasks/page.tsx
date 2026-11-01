import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ShipForm } from "./ship-form";
import { OrderShipForm, StockForm } from "./order-forms";

/**
 * C-05 처리 큐 (zh-CN): 발주 재고 확인 · 발주 출고(확정 뒤에만) · 샘플 출고 대기(입금 확인 전엔 버튼 없음) · 브랜드 반응·거절 사유(zh). 기한 순.
 * v_order_lines_cn: 본인 상품 라인만, KRW 단가 없음(원가와 합치면 마진이 역산된다).
 * v_sample_items_cn: 본인 상품 라인만, CN_VENDOR는 브랜드 마스킹, 브랜드 한국어 원문·주소 없음.
 */
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
  const lineLabel = (l: { product_code: string | null; name_zh: string | null; color_zh: string | null; size_label: string | null }) =>
    `${l.product_code ?? ""} ${l.name_zh ?? ""} · ${[l.color_zh, l.size_label].filter(Boolean).join(" / ")}`;
  const head = (h: { brand_label: string | null; ordered_at: string | null; due_at: string | null; gb_close_date: string | null }) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-ink-2">{h.brand_label} · {fmtDate(h.ordered_at, L)}{h.gb_close_date ? ` · ${t(L, "cn.order.gbClose", { date: fmtDate(h.gb_close_date, L) })}` : ""}</span>
      <span className={`num ${isOverdue(h.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(h.due_at, L, true)}</span>
    </div>
  );
  return (
    <div className="space-y-8">
      <h1 className="text-[20px] font-bold">{t(L, "cn.queue")}</h1>
      <section>
        <h2 className="text-[13px] font-semibold">{t(L, "cn.order.stockTodo")} <span className="num text-muted">{stockTodo.length}</span></h2>
        {stockTodo.length === 0 ? <p className="mt-2 text-[13px] text-muted">{t(L, "cn.tasks.none")}</p> : (
          <ul className="mt-2 space-y-3">
            {stockTodo.map((g) => (
              <li key={g.id} className="bg-surface p-3 text-[13px]">
                {head(g.lines[0])}
                <div className="mt-2">
                  <StockForm orderId={g.id} locale={L} lines={g.lines.filter((l) => l.stock_result === "pending").map((l) => ({ id: l.id, label: lineLabel(l), expected: l.expected_qty }))} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-[13px] font-semibold">{t(L, "cn.order.shipTodo")} <span className="num text-muted">{shipTodo.length}</span></h2>
        {shipTodo.length === 0 ? <p className="mt-2 text-[13px] text-muted">{t(L, "cn.tasks.none")}</p> : (
          <ul className="mt-2 space-y-3">
            {shipTodo.map((g) => (
              <li key={g.id} className="bg-surface p-3 text-[13px]">
                {head(g.lines[0])}
                <ul className="mt-2 divide-y divide-line">
                  {g.lines.filter((l) => l.qty > 0).map((l) => (
                    <li key={l.id} className="flex justify-between py-1">
                      <span>{lineLabel(l)}</span>
                      <span className="num">×{l.qty}{l.line_cn_shipped_at ? ` · ${t(L, "cn.order.shipped")}` : ""}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2"><OrderShipForm orderId={g.id} locale={L} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-[13px] font-semibold">{t(L, "cn.tasks.toShip")} <span className="num text-muted">{toShip.length}</span></h2>
        {toShip.length === 0 ? <p className="mt-2 text-[13px] text-muted">{t(L, "cn.tasks.none")}</p> : (
          <ul className="mt-2 space-y-3">
            {toShip.map((g) => {
              const h = g.items[0];
              const ready = h.request_status === "requested";
              return (
                <li key={g.id} className="bg-surface p-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink-2">{h.brand_label} · {fmtDate(h.requested_at, L)}</span>
                    <span className="flex items-center gap-2">
                      <span className={`num ${isOverdue(h.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(h.due_at, L, true)}</span>
                      <StatusPill entity="sample_request" status={h.request_status} locale={L} />
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-line">
                    {g.items.map((i) => (
                      <li key={i.id} className="flex justify-between py-1">
                        <span>{i.product_code} {i.name_zh} · {[i.color_zh, i.size_label].filter(Boolean).join(" / ")}</span>
                        <span className="num">×{i.qty}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">{ready ? <ShipForm sampleId={g.id} locale={L} /> : <p className="text-[12px] text-warn">{t(L, "cn.tasks.waitPayment")}</p>}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-[13px] font-semibold">{t(L, "cn.tasks.feedback")}</h2>
        {feedback.length === 0 ? <p className="mt-2 text-[13px] text-muted">{t(L, "cn.tasks.none")}</p> : (
          <ul className="mt-2 divide-y divide-line border-y border-line bg-surface text-[13px]">
            {feedback.map((i) => (
              <li key={i.id} className="px-3 py-2">
                <span className="font-medium">{i.product_code} {i.name_zh}</span> · {[i.color_zh, i.size_label].filter(Boolean).join(" / ")} —{" "}
                <span className={i.feedback === "interested" ? "text-signature" : i.feedback === "declined" ? "text-warn" : ""}>{t(L, `status.offer.${i.feedback}`)}</span>
                {i.feedback_reason && ` · ${t(L, `decline.${i.feedback_reason}`)}`}
                {i.feedback_note_zh && <p className="mt-0.5 text-[12px] text-ink-2">{i.feedback_note_zh}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
