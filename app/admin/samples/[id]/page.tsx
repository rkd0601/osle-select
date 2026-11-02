import Link from "next/link";
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
  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/admin/samples" className="text-meta text-muted">{tk("common.back")}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h2 font-bold">{brand?.name} · {fmtDate(r.created_at)}</h1>
        <StatusPill entity="sample_request" status={r.status} />
        <span className="text-meta text-ink-2">{tk(`admin.samples.tier.${brand?.tier ?? "new"}`)}</span>
      </div>
      <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-body md:grid-cols-4">
        <dt className="text-muted">{tk("sample.new.logistics")}</dt><dd>₩{krw(r.logistics_fee_krw)}</dd>
        <dt className="text-muted">{tk("admin.samples.productTotal")}</dt><dd>₩{krw(r.product_fee_total_krw)}</dd>
        <dt className="text-muted">{tk("admin.samples.paymentReported")}</dt><dd>{r.payment_reported_at ? `${fmtDate(r.payment_reported_at, "ko", true)} ${r.payment_note ?? ""}` : "-"}</dd>
        <dt className="text-muted">{tk("admin.samples.paymentConfirmed")}</dt><dd>{r.payment_confirmed_at ? fmtDate(r.payment_confirmed_at, "ko", true) : "-"}</dd>
        <dt className="text-muted">{tk("admin.samples.cnTracking")}</dt><dd>{r.cn_tracking ?? "-"}</dd>
        <dt className="text-muted">{tk("admin.samples.krTracking")}</dt><dd>{r.kr_tracking ?? "-"}</dd>
        <dt className="text-muted">{tk("sample.detail.returnDueLabel")}</dt><dd>{r.return_due ?? "-"}</dd>
        <dt className="text-muted">{tk("sample.new.shipTo")}</dt><dd className="font-sans">{ship ? `${ship.name} ${ship.phone} · ${ship.address}` : "-"}</dd>
      </dl>
      <SampleStepControls sampleId={r.id} status={r.status} feedbackOverdue={feedbackOverdue(r.feedback_due, now)} />
      <ol className="divide-y divide-line border-t border-ink">
        {items.map((i) => {
          const v = data.variants.find((x) => x.id === i.variant_id);
          const p = v && data.products.find((x) => x.id === v.product_id);
          const c = v && data.colors.find((x) => x.id === v.color_id);
          const s = v && data.sizes.find((x) => x.id === v.size_id);
          const parts = MEASUREMENT_TEMPLATE[p?.category ?? ""] ?? ["length", "shoulder", "chest", "sleeve"];
          const overdue = returnOverdue(i, r.return_due, now);
          return (
            <li key={i.id} className="grid gap-4 py-4 md:grid-cols-[1fr_320px]">
              <div className="flex gap-3 text-body">
                {i.inspection_photo_path && photos[i.inspection_photo_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                  <img src={photos[i.inspection_photo_path]} alt="" className="aspect-[3/4] w-16 bg-sand object-cover" />
                ) : <span className="aspect-[3/4] w-16 bg-sand" />}
                <div>
                  <div className="num text-caption text-muted">{p?.code}</div>
                  <div className="font-medium">{p?.name_ko || p?.name_zh}</div>
                  <div className="num text-ink-2">{[c?.name_ko || c?.name_zh, s?.label].filter(Boolean).join(" / ")} · ×{i.qty}</div>
                  <div className="text-meta">{tk(`sample.inspect.${i.status === "pending" ? "pending" : i.status}`)}{i.inspection_defect ? ` · ${tk(`sample.defect.${i.inspection_defect}`)}` : ""}</div>
                  {i.inspection_note_internal && <div className="text-caption text-muted">{i.inspection_note_internal}</div>}
                  {i.feedback && <div className="text-meta">{tk("admin.samples.feedback")}: {tk(`status.offer.${i.feedback}`)}{i.feedback_reason ? ` · ${tk(`decline.${i.feedback_reason}`)}` : ""} {i.feedback_note ?? ""}</div>}
                  {i.return_requested_at && <div className="num text-meta">{tk("sample.return.requested", { t: i.return_tracking ?? "" })}</div>}
                  {i.return_status === "returned" && <div className="text-meta text-signature">{tk("sample.return.done")} {i.library_location ?? ""}</div>}
                  {i.charge_status === "charged" && <div className="num text-meta text-warn">{tk("sample.charged", { n: krw(i.charged_krw) })}</div>}
                  {overdue && <div className="text-meta font-semibold text-crit">{tk("admin.samples.overdue")}</div>}
                </div>
              </div>
              <div>
                {r.status === "kr_arrived" && i.status === "pending" && (
                  <InspectControls itemId={i.id} defects={SAMPLE_DEFECTS} size={s ? { id: s.id, parts, measurements: (s.measurements ?? {}) as Record<string, number> } : null} />
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
      <div className="mt-8"><CommentThread targetType="sample_request" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={await adminThread("sample_request", id, me.id)} /></div>
    </div>
  );
}
