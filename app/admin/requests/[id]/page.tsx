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
import { commentSummaryRows } from "@/lib/timeline-rows";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { ItemPanel } from "./item-panel";
import { AddItemForm, MemoZhEditor, MoveImage } from "./request-tools";
import { CnQuestionGate, type GateQuestion } from "./cn-question-gate";
import { CommentThread } from "@/components/domain/comment-thread";
import { adminThread } from "@/lib/db/comments";
import { requireRole } from "@/lib/auth/session";

/** A-02 요청 상세: 항목 정리·번역·보완 요청·배정. 레이아웃이 ADMIN을 검증한다. */
export default async function AdminRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const data = await getAdminRequest(id);
  if (!data) notFound();
  const { request, items, images, comments, questions } = data;
  const me = await requireRole(["ADMIN"], "/admin");
  const [staff, urls, events, thread, itemThreads] = await Promise.all([
    listCnStaff(),
    signedReadUrls("requestImages", images.flatMap((i) => (i.storage_path ? [i.storage_path] : []))),
    transitionEvents("request_item", items.map((i) => i.id)),
    adminThread("request", id, me.id),
    Promise.all(items.map((i) => adminThread("request_item", i.id, me.id))),
  ]);
  const brand = Array.isArray(request.brands) ? request.brands[0] : request.brands;
  const defaultSla = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const seqOf = new Map(items.map((i) => [i.id, i.seq as number]));
  const targets = items.filter((i) => isEditableByAdmin(i.status)).map((i) => ({ id: i.id as string, seq: i.seq as number }));
  const unsorted = images.filter((i) => !i.request_item_id);
  const rows: TimelineRow[] = [
    { at: request.created_at, label: tk("timeline.created") },
    ...events.filter((e) => e.kind === "transition").map((e) => ({ at: e.at, label: `#${seqOf.get(e.entityId)} ${tk(`status.request_item.${e.from}`)} → ${tk(`status.request_item.${e.to}`)}` })),
    ...commentSummaryRows(comments, (n) => tk("timeline.comments", { n })), // 본문은 항목별 코멘트 칸에서만 (u-11)
  ].sort((a, b) => a.at.localeCompare(b.at));

  const imageGrid = (list: typeof images, current: string | null) => (
    <div className="grid grid-cols-5 gap-2 md:grid-cols-8">
      {list.map((img) => (
        <div key={img.id}>
          {img.storage_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
            <img src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
          ) : (
            <a href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="flex aspect-[3/4] items-center break-all bg-surface p-1 text-micro underline">{img.source_url}</a>
          )}
          <MoveImage imageId={img.id} current={current} targets={targets} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <Link href="/admin/requests" className="text-meta text-muted">{tk("common.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-bold">{request.title}</h1>
          <StatusPill entity="request" status={request.status} />
          <Link href={`/b/${brand?.slug}/requests/${request.id}`} className="text-meta text-signature">{brand?.name} ↗</Link>
          {request.created_via === "admin_proxy" && <span className="text-caption text-muted">{tk("request.proxyBadge")}</span>}
          {request.target_date && <span className="num text-meta text-ink-2">{tk("request.field.targetDate")} {fmtDate(request.target_date)}</span>}
        </div>

        {request.memo && (
          <section className="mt-4 space-y-2">
            <Bilingual ko={request.memo} zh={request.memo_zh} labelZh={tk("admin.request.memoZh")} />
            <MemoZhEditor requestId={request.id} memo={request.memo} memoZh={request.memo_zh ?? ""} />
          </section>
        )}

        {unsorted.length > 0 && (
          <section className="mt-6">
            <h2 className="text-meta font-semibold text-ink-2">{tk("admin.request.unsorted")}</h2>
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
                  <span className="num text-h3 font-semibold">#{it.seq}</span>
                  <StatusPill entity="request_item" status={status} />
                  <span className="text-meta text-ink-2">{it.owner_role ?? ""}</span>
                  <span className={`num text-meta ${isOverdue(it.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(it.due_at, "ko", true)}</span>
                  {it.assigned_to && <span className="text-meta text-ink-2">→ {staff.find((s) => s.id === it.assigned_to)?.name ?? it.assigned_to.slice(0, 8)}</span>}
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
                <details className="mt-3" open={itemThreads[items.indexOf(it)].some((c) => c.visibility === "cn")}>
                  <summary className="cursor-pointer text-meta text-ink-2">{tk("comments.title")} <span className="num">{itemThreads[items.indexOf(it)].length}</span></summary>
                  <div className="mt-2"><CommentThread targetType="request_item" targetId={it.id} viewer="admin" tabs={["cn", "brand", "internal"]} rows={itemThreads[items.indexOf(it)]} /></div>
                </details>
                {qs.length > 0 && (
                  <div className="mt-3 bg-surface p-3">
                    <h3 className="text-meta font-semibold">{tk("admin.request.cnQuestions")}</h3>
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
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("request.detail.timeline")}</h2>
        <div className="mt-3"><Timeline rows={rows} /></div>
        <div className="mt-8"><CommentThread targetType="request" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={thread} /></div>
      </aside>
    </div>
  );
}
