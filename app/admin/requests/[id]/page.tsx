import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAdminRequest, listCnStaff } from "@/lib/db/admin/requests";
import { signedReadUrls } from "@/lib/storage";
import { transitionEvents } from "@/lib/timeline";
import { allowedNext } from "@/lib/transitions";
import { NEEDS_INFO_REASONS, isEditableByAdmin, type RequestItemStatus } from "@/lib/requests";
import { StatusPill } from "@/components/domain/status-pill";
import { Bilingual } from "@/components/domain/bilingual";
import { Timeline, type TimelineRow } from "@/components/domain/timeline";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ItemPanel } from "./item-panel";
import { AddItemForm, MemoZhEditor, MoveImage } from "./request-tools";
import { CnQuestionGate, type GateQuestion } from "./cn-question-gate";

/** A-02 요청 상세: 항목 정리·번역·보완 요청·배정. 레이아웃이 ADMIN을 검증한다. */
export default async function AdminRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const data = await getAdminRequest(id);
  if (!data) notFound();
  const { request, items, images, comments, questions } = data;
  const [staff, urls, events] = await Promise.all([
    listCnStaff(),
    signedReadUrls("requestImages", images.flatMap((i) => (i.storage_path ? [i.storage_path] : []))),
    transitionEvents("request_item", items.map((i) => i.id)),
  ]);
  const brand = Array.isArray(request.brands) ? request.brands[0] : request.brands;
  const defaultSla = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const seqOf = new Map(items.map((i) => [i.id, i.seq as number]));
  const targets = items.filter((i) => isEditableByAdmin(i.status)).map((i) => ({ id: i.id as string, seq: i.seq as number }));
  const unsorted = images.filter((i) => !i.request_item_id);
  const rows: TimelineRow[] = [
    { at: request.created_at, label: tk("timeline.created") },
    ...events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: `#${seqOf.get(e.entityId)} ${e.from} → ${e.to}` })),
    ...comments.map((c) => ({ at: c.created_at, label: `${tk("timeline.comment")} · ${c.visibility}`, sub: c.body_ko ?? c.body_zh })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const imageGrid = (list: typeof images, current: string | null) => (
    <div className="grid grid-cols-5 gap-2 md:grid-cols-8">
      {list.map((img) => (
        <div key={img.id}>
          {img.storage_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
            <img src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
          ) : (
            <a href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="flex aspect-[3/4] items-center break-all bg-surface p-1 text-[10px] underline">{img.source_url}</a>
          )}
          <MoveImage imageId={img.id} current={current} targets={targets} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <Link href="/admin/requests" className="text-[12px] text-muted">{tk("common.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-bold">{request.title}</h1>
          <StatusPill entity="request" status={request.status} />
          <Link href={`/b/${brand?.slug}/requests/${request.id}`} className="text-[12px] text-signature">{brand?.name} ↗</Link>
          {request.created_via === "admin_proxy" && <span className="text-[11px] text-muted">{tk("request.proxyBadge")}</span>}
          {request.target_date && <span className="num text-[12px] text-ink-2">{tk("request.field.targetDate")} {fmtDate(request.target_date)}</span>}
        </div>

        {request.memo && (
          <section className="mt-4 space-y-2">
            <Bilingual ko={request.memo} zh={request.memo_zh} labelZh={tk("admin.request.memoZh")} />
            <MemoZhEditor requestId={request.id} memo={request.memo} memoZh={request.memo_zh ?? ""} />
          </section>
        )}

        {unsorted.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[12px] font-semibold text-ink-2">{tk("admin.request.unsorted")}</h2>
            <div className="mt-2">{imageGrid(unsorted, null)}</div>
          </section>
        )}

        <ol className="mt-6 space-y-6">
          {items.map((it) => {
            const status = it.status as RequestItemStatus;
            const qs = questions.filter((q) => q.request_item_id === it.id);
            return (
              <li key={it.id} className="border-t border-ink pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="num text-[18px] font-semibold">#{it.seq}</span>
                  <StatusPill entity="request_item" status={status} />
                  <span className="text-[12px] text-ink-2">{it.owner_role ?? ""}</span>
                  <span className={`num text-[12px] ${isOverdue(it.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(it.due_at, "ko", true)}</span>
                  {it.assigned_to && <span className="text-[12px] text-ink-2">→ {staff.find((s) => s.id === it.assigned_to)?.name ?? it.assigned_to.slice(0, 8)}</span>}
                </div>
                <div className="mt-3">{imageGrid(images.filter((i) => i.request_item_id === it.id), it.id)}</div>
                <div className="mt-3">
                  <ItemPanel
                    item={it}
                    allowed={allowedNext("request_item", status, "ADMIN")}
                    editable={isEditableByAdmin(status)}
                    staff={staff}
                    siblings={targets.filter((t) => t.id !== it.id)}
                    defaultSla={defaultSla}
                    reasons={NEEDS_INFO_REASONS}
                  />
                </div>
                {qs.length > 0 && (
                  <div className="mt-3 bg-surface p-3">
                    <h3 className="text-[12px] font-semibold">{tk("admin.request.cnQuestions")}</h3>
                    {qs.map((q) => (
                      <div key={q.id} className="mt-2">
                        <CnQuestionGate q={{ ...q, options: (q.options ?? []) as GateQuestion["options"] }} />
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-6 border-t border-line pt-4">
          <AddItemForm requestId={request.id} />
        </div>
      </div>
      <aside>
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("request.detail.timeline")}</h2>
        <div className="mt-3"><Timeline rows={rows} /></div>
      </aside>
    </div>
  );
}
