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
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { Photo } from "@/components/domain/photo";
import { BackLink, DetailLayout, Facts, Section } from "../../_ui/ui";
import { InspectControls, ReturnControls, SampleStepControls, UnavailableCredit } from "./admin-controls";

/** A-05 샘플 상세: 입금·도착·variant별 검품(+실측)·발송·회수/미회수. 레이아웃이 ADMIN을 검증한다. */
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
      <PageHeader eyebrow={`${tk("entity.sample_request")} · ${tk(`admin.samples.tier.${brand?.tier ?? "new"}`)}`} title={`${brand?.name ?? ""} · ${fmtDate(r.created_at)}`}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill entity="sample_request" status={r.status} />
          <span className="num text-meta text-ink-2">{tk("sample.list.qty", { n: qty })}</span>
          {overdueCount > 0 && <span className="rounded-full bg-crit-soft px-2 py-0.5 text-caption font-semibold text-crit">{tk("admin.samples.overdue")} · {overdueCount}</span>}
        </div>
      </PageHeader>
      <DetailLayout
        main={
          <>
            <Section title={tk("admin.samples.items")} count={items.length} flush>
              <ol className="divide-y divide-line">
                {items.map((i) => {
                  const v = data.variants.find((x) => x.id === i.variant_id);
                  const p = v && data.products.find((x) => x.id === v.product_id);
                  const c = v && data.colors.find((x) => x.id === v.color_id);
                  const s = v && data.sizes.find((x) => x.id === v.size_id);
                  const parts = MEASUREMENT_TEMPLATE[p?.category ?? ""] ?? ["length", "shoulder", "chest", "sleeve"];
                  const overdue = returnOverdue(i, r.return_due, now);
                  return (
                    <li key={i.id} className={`grid gap-4 px-5 py-4 2xl:grid-cols-[minmax(0,1fr)_320px] ${overdue ? "shadow-[inset_3px_0_0_var(--color-crit)]" : ""}`}>
                      <div className="flex gap-3 text-body">
                        <span className="w-16 shrink-0"><Photo src={i.inspection_photo_path ? photos[i.inspection_photo_path] : null} /></span>
                        <div className="min-w-0 space-y-0.5">
                          <div className="num text-caption text-muted">{p?.code}</div>
                          <div className="font-medium">{p?.name_ko || p?.name_zh}</div>
                          <div className="num text-ink-2">{[c?.name_ko || c?.name_zh, s?.label].filter(Boolean).join(" / ")} · ×{i.qty}</div>
                          <div className="text-meta">
                            <span className={i.status === "ok" ? "font-medium text-signature" : i.status === "pending" ? "text-ink-2" : "font-medium text-warn"}>{tk(`sample.inspect.${i.status === "pending" ? "pending" : i.status}`)}</span>
                            {i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}
                          </div>
                          {i.inspection_note_internal && <div className="text-caption text-muted">{i.inspection_note_internal}</div>}
                          {i.feedback && <div className="text-meta">{tk("admin.samples.feedback")}: {tk(`status.offer.${i.feedback}`)}{i.feedback_reason ? ` · ${tk(`decline.${i.feedback_reason}`)}` : ""} {i.feedback_note ?? ""}</div>}
                          {i.return_requested_at && <div className="num text-meta">{tk("sample.return.requested", { t: i.return_tracking ?? "" })}</div>}
                          {i.return_status === "returned" && <div className="text-meta text-signature">{tk("sample.return.done")} {i.library_location ?? ""}</div>}
                          {i.charge_status === "charged" && <div className="num text-meta text-warn">{tk("sample.charged", { n: krw(i.charged_krw) })}</div>}
                          {overdue && <div className="text-meta font-semibold text-crit">{tk("admin.samples.overdue")}</div>}
                        </div>
                      </div>
                      <div className="min-w-0">
                        {r.status === "kr_arrived" && i.status === "pending" && (
                          <div className="rounded-ui border border-line bg-paper p-3">
                            <InspectControls itemId={i.id} defects={SAMPLE_DEFECTS} size={s ? { id: s.id, parts, measurements: (s.measurements ?? {}) as Record<string, number> } : null} />
                          </div>
                        )}
                        {i.status === "unavailable" && i.credited_krw === 0 && !["requested", "awaiting_payment", "cn_shipped", "kr_arrived", "cancelled"].includes(r.status) && <UnavailableCredit itemId={i.id} />}
                        {i.credited_krw > 0 && <p className="num text-meta text-signature">{tk("admin.samples.credited", { n: krw(i.credited_krw) })}</p>}
                        {["delivered", "feedback_done"].includes(r.status) && i.status !== "unavailable" && i.return_status !== "returned" && i.charge_status === "none" && (
                          <ReturnControls itemId={i.id} overdue={overdue} amount={krw(chargeAmount(i))} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>
            <Section title={tk("comments.title")}><CommentThread targetType="sample_request" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={thread} /></Section>
          </>
        }
        aside={
          <>
            <Section title={tk("admin.ui.nextAction")} tone="brand">
              <SampleStepControls sampleId={r.id} status={r.status} feedbackOverdue={feedbackOverdue(r.feedback_due, now)} />
              <p className="mt-2 text-caption text-muted">{tk("admin.samples.nowAt", { s: tk(`status.sample_request.${r.status}`) })}</p>
            </Section>
            <Section title={tk("admin.samples.money")}>
              <div className="num text-title font-semibold leading-none">₩{krw(r.logistics_fee_krw)}</div>
              <div className="mt-1 text-meta text-ink-2">{tk("sample.new.logistics")}</div>
              <div className="mt-4">
                <Facts rows={[
                  [tk("admin.samples.productTotal"), <span key="p" className="num">₩{krw(r.product_fee_total_krw)}</span>],
                  [tk("admin.samples.paymentReported"), r.payment_reported_at ? <span key="r" className="num text-warn">{fmtDate(r.payment_reported_at, "ko", true)} {r.payment_note ?? ""}</span> : "-"],
                  [tk("admin.samples.paymentConfirmed"), r.payment_confirmed_at ? <span key="c" className="num text-signature">{fmtDate(r.payment_confirmed_at, "ko", true)}</span> : "-"],
                ]} />
              </div>
            </Section>
            <Section title={tk("admin.samples.shipping")}>
              <Facts rows={[
                [tk("admin.samples.cnTracking"), <span key="cn" className="num">{r.cn_tracking ?? "-"}</span>],
                [tk("admin.samples.krTracking"), <span key="kr" className="num">{r.kr_tracking ?? "-"}</span>],
                [tk("sample.detail.returnDueLabel"), <span key="rd" className={`num ${overdueCount ? "font-semibold text-crit" : ""}`}>{r.return_due ?? "-"}</span>],
                [tk("sample.new.shipTo"), ship ? `${ship.name} ${ship.phone} · ${ship.address}` : "-"],
              ]} />
            </Section>
          </>
        }
      />
    </div>
  );
}
