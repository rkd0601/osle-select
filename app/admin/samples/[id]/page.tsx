import { CommentThread } from "@/components/domain/comment-thread";
import { adminThread } from "@/lib/db/comments";
import { requireRole } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getSampleForAdmin } from "@/lib/db/admin/samples";
import { signedReadUrls } from "@/lib/storage";
import { feedbackOverdue, returnOverdue, SAMPLE_DEFECTS, chargeAmount } from "@/lib/samples";
import { MEASUREMENT_TEMPLATE } from "@/lib/codes";
import { StatusPill } from "@/components/domain/status-pill";
import { InvoiceSheet } from "@/components/domain/invoice-sheet";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { Photo } from "@/components/domain/photo";
import { BackLink, DetailLayout, Facts, Section } from "../../_ui/ui";
import { InspectControls, ReturnControls, SampleStepControls, UnavailableCredit } from "./admin-controls";

/** A-05 샘플 상세: 입금·도착·variant별 검품(+실측)·발송·회수/미회수. 룰 섹션 + 오른쪽 360(다음 행동·청구표·배송). 레이아웃이 ADMIN을 검증한다. */
export default async function AdminSampleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const me = await requireRole(["ADMIN"], "/admin");
  const data = await getSampleForAdmin(id);
  if (!data) notFound();
  const { request: r, items } = data;
  const brand = Array.isArray(r.brands) ? r.brands[0] : r.brands;
  const photos = await signedReadUrls("samplePhotos", items.flatMap((i) => (i.inspection_photo_path ? [i.inspection_photo_path] : [])));
  const now = new Date();
  const ship = r.ship_to as { name?: string; phone?: string; address?: string; memo?: string } | null;
  const thread = await adminThread("sample_request", id, me.id);
  const qty = items.reduce((n, i) => n + i.qty, 0);
  const overdueCount = items.filter((i) => returnOverdue(i, r.return_due, now)).length;
  return (
    <div>
      <BackLink href="/admin/samples" />
      <PageHeader
        eyebrow={[tk("entity.sample_request"), fmtDate(r.created_at), `#${r.id.slice(0, 4).toUpperCase()}`, tk(`admin.samples.tier.${brand?.tier ?? "new"}`)].join(" · ")}
        title={<>{brand?.name ?? ""} <span className="num font-light text-muted">· {tk("sample.list.qty", { n: qty })}</span></>}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StatusPill entity="sample_request" status={r.status} />
          {overdueCount > 0 && <span className="st crit">{tk("admin.samples.overdue")} · {overdueCount}</span>}
        </div>
      </PageHeader>
      <DetailLayout
        main={
          <>
            <Section title={tk("admin.samples.items")} count={items.length}>
              <ol className="-mt-5">
                {items.map((i) => {
                  const v = data.variants.find((x) => x.id === i.variant_id);
                  const p = v && data.products.find((x) => x.id === v.product_id);
                  const c = v && data.colors.find((x) => x.id === v.color_id);
                  const s = v && data.sizes.find((x) => x.id === v.size_id);
                  const parts = MEASUREMENT_TEMPLATE[p?.category ?? ""] ?? ["length", "shoulder", "chest", "sleeve"];
                  const overdue = returnOverdue(i, r.return_due, now);
                  const inspectTone = i.status === "ok" ? "done" : i.status === "pending" ? "wait" : "warn";
                  return (
                    <li key={i.id} className="grid gap-6 border-b border-line py-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="flex gap-5 text-body">
                        <span className="w-20 shrink-0"><Photo src={i.inspection_photo_path ? photos[i.inspection_photo_path] : null} /></span>
                        <div className="min-w-0 space-y-1">
                          <div className="num text-caption text-muted">{p?.code}</div>
                          <div className="text-lead font-medium">{p?.name_ko || p?.name_zh}</div>
                          <div className="num text-meta text-ink-2">{[c?.name_ko || c?.name_zh, s?.label].filter(Boolean).join(" / ")} · ×{i.qty}</div>
                          <div className="pt-1">
                            <span className={`st ${inspectTone}`}>{tk(`sample.inspect.${i.status === "pending" ? "pending" : i.status}`)}{i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}</span>
                          </div>
                          {i.inspection_note_internal && <div className="text-caption text-muted">{i.inspection_note_internal}</div>}
                          {i.feedback && <div className="text-meta text-ink-2">{tk("admin.samples.feedback")}: {tk(`status.offer.${i.feedback}`)}{i.feedback_reason ? ` · ${tk(`decline.${i.feedback_reason}`)}` : ""} {i.feedback_note ?? ""}</div>}
                          {i.return_requested_at && <div className="num text-meta text-ink-2">{tk("sample.return.requested", { t: i.return_tracking ?? "" })}</div>}
                          {i.return_status === "returned" && <div><span className="st done">{tk("sample.return.done")} {i.library_location ?? ""}</span></div>}
                          {i.charge_status === "charged" && <div className="num text-meta text-warn">{tk("sample.charged", { n: krw(i.charged_krw) })}</div>}
                          {overdue && <div><span className="st crit">{tk("admin.samples.overdue")}</span></div>}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {r.status === "kr_arrived" && i.status === "pending" && (
                          <div className="bg-surface p-5">
                            <InspectControls itemId={i.id} defects={SAMPLE_DEFECTS} size={s ? { id: s.id, parts, measurements: (s.measurements ?? {}) as Record<string, number> } : null} />
                          </div>
                        )}
                        {i.status === "unavailable" && i.credited_krw === 0 && !["requested", "awaiting_payment", "cn_shipped", "kr_arrived", "cancelled"].includes(r.status) && <UnavailableCredit itemId={i.id} />}
                        {i.credited_krw > 0 && <p className="num text-meta text-ink-2">{tk("admin.samples.credited", { n: krw(i.credited_krw) })}</p>}
                        {["delivered", "feedback_done"].includes(r.status) && i.status !== "unavailable" && i.return_status !== "returned" && i.charge_status === "none" && (
                          <ReturnControls itemId={i.id} overdue={overdue} amount={krw(chargeAmount(i))} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>
            <div className="pt-12"><CommentThread targetType="sample_request" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={thread} /></div>
          </>
        }
        aside={
          <>
            <div className="border-t border-ink pt-5">
              <div className="label mb-3">{tk("admin.ui.nextAction")}</div>
              <SampleStepControls sampleId={r.id} status={r.status} feedbackOverdue={feedbackOverdue(r.feedback_due, now)} />
            </div>
            <div className="mt-10">
              <InvoiceSheet
                label={tk("admin.samples.money")}
                total={r.logistics_fee_krw}
                rows={[{ label: tk("sample.new.logistics"), value: r.logistics_fee_krw }]}
                sumLabel={tk("order.invoice.total")}
                help={tk("admin.samples.productTotalLine", { n: krw(r.product_fee_total_krw) })}
              >
                <Facts rows={[
                  [tk("admin.samples.paymentReported"), r.payment_reported_at ? <span key="r" className="num text-warn">{fmtDate(r.payment_reported_at, "ko", true)} {r.payment_note ?? ""}</span> : "-"],
                  [tk("admin.samples.paymentConfirmed"), r.payment_confirmed_at ? <span key="c" className="num">{fmtDate(r.payment_confirmed_at, "ko", true)}</span> : "-"],
                ]} />
              </InvoiceSheet>
            </div>
            <div className="pt-12">
              <Section title={tk("admin.samples.shipping")}>
                <Facts rows={[
                  [tk("admin.samples.cnTracking"), <span key="cn" className="num">{r.cn_tracking ?? "-"}</span>],
                  [tk("admin.samples.krTracking"), <span key="kr" className="num">{r.kr_tracking ?? "-"}</span>],
                  [tk("sample.detail.returnDueLabel"), <span key="rd" className={`num ${overdueCount ? "font-medium text-crit" : ""}`}>{r.return_due ?? "-"}</span>],
                  [tk("sample.new.shipTo"), ship ? `${ship.name} ${ship.phone} · ${ship.address}` : "-"],
                ]} />
              </Section>
            </div>
          </>
        }
      />
    </div>
  );
}
