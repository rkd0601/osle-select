import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ShipForm } from "./ship-form";

/**
 * C-05 처리 큐 (zh-CN): 샘플 출고 대기(입금 확인 전엔 버튼 없음) · 출고 완료 · 브랜드 반응·거절 사유(zh). 기한 순.
 * v_sample_items_cn: 본인 상품 라인만, CN_VENDOR는 브랜드 마스킹, 브랜드 한국어 원문·주소 없음.
 */
export default async function CnTasks() {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/tasks");
  const L = u.locale;
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_sample_items_cn")
    .select("id, sample_request_id, qty, status, feedback, feedback_reason, feedback_note_zh, request_status, payment_required, payment_confirmed_at, cn_tracking, cn_shipped_at, due_at, requested_at, product_code, name_zh, color_zh, size_label, brand_label")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);
  const rows = data ?? [];
  const groups = [...new Set(rows.map((r) => r.sample_request_id))].map((id) => ({ id, items: rows.filter((r) => r.sample_request_id === id) }));
  const toShip = groups.filter((g) => ["requested", "awaiting_payment"].includes(g.items[0].request_status));
  const feedback = rows.filter((r) => r.feedback);
  return (
    <div className="space-y-8">
      <h1 className="text-[20px] font-bold">{t(L, "cn.queue")}</h1>
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
