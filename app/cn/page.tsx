import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyItems } from "@/lib/db/cn/requests";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";

/** C-01 내 요청 항목 (v_request_items_cn: VENDOR는 브랜드명·희망 단가 마스킹). 기한 순. */
export default async function CnHome() {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
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
  return (
    <div>
      {queue.some(([, n]) => n > 0) && (
        <Link href="/cn/tasks" className="mb-5 flex flex-wrap items-center gap-4 border border-line bg-surface px-4 py-3 text-body hover:bg-paper">
          <span className="font-medium">{t(L, "cn.queue")} →</span>
          {queue.filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className="text-ink-2">{t(L, k)} <span className="num font-semibold text-warn">{n}</span></span>)}
        </Link>
      )}
      <h1 className="text-h2 font-bold">{t(L, "cn.items")} <span className="num text-muted">{items.length}</span></h1>
      {items.length === 0 ? (
        <p className="py-10 text-body text-ink-2">{t(L, "cn.item.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line bg-surface">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={`/cn/items/${it.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-body hover:bg-paper">
                <div className="min-w-0">
                  <div className="truncate font-medium">#{it.seq} {it.description_zh ?? t(L, "cn.item.noZh")}</div>
                  <div className="text-muted">{it.brand_label} · {it.expected_qty_range ? t(L, `qtyRange.${it.expected_qty_range}`) : "-"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`num ${isOverdue(it.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(it.due_at, L)}</span>
                  <StatusPill entity="request_item" status={it.status} locale={L} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
