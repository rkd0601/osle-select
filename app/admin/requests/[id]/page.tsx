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
import { PageHeader } from "@/components/domain/page-header";
import { BackLink, DetailLayout, Due, Facts, Section } from "../../_ui/ui";
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
  const now = new Date();
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
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 2xl:grid-cols-8">
      {list.map((img) => (
        <div key={img.id}>
          {img.storage_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
            <img src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full rounded-ui bg-sand object-cover" />
          ) : (
            <a href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="flex aspect-[3/4] items-center break-all bg-surface p-1 text-micro underline">{img.source_url}</a>
          )}
          <MoveImage imageId={img.id} current={current} targets={targets} />
        </div>
      ))}
    </div>
  );

  const late = items.filter((i) => isOverdue(i.due_at, now)).length;
  const open = items.filter((i) => !["closed", "cancelled"].includes(i.status)).length;

  return (
    <div>
      <BackLink href="/admin/requests" />
      <PageHeader eyebrow={`${tk("admin.request.entity")} · ${brand?.name ?? ""}`} title={request.title}
        actions={<Link href={`/b/${brand?.slug}/requests/${request.id}`} className="btn btn-secondary btn-sm">{tk("admin.request.asBrand")} ↗</Link>}>
        <div className="flex flex-wrap items-center gap-3 text-meta text-ink-2">
          <StatusPill entity="request" status={request.status} />
          {request.created_via === "admin_proxy" && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">{tk("request.proxyBadge")}</span>}
          {request.target_date && <span className="num">{tk("request.field.targetDate")} {fmtDate(request.target_date)}</span>}
          <span className="num">{tk("admin.request.created", { date: fmtDate(request.created_at, "ko", true) })}</span>
        </div>
      </PageHeader>
      <DetailLayout
        asideWidth="340px"
        main={
          <>
            {request.memo && (
              <Section title={tk("admin.request.memo")}>
                <div className="space-y-3">
                  <Bilingual ko={request.memo} zh={request.memo_zh} labelZh={tk("admin.request.memoZh")} />
                  <MemoZhEditor requestId={request.id} memo={request.memo} memoZh={request.memo_zh ?? ""} />
                </div>
              </Section>
            )}

            {unsorted.length > 0 && (
              <Section title={tk("admin.request.unsorted")} count={unsorted.length} tone="warn">{imageGrid(unsorted, null)}</Section>
            )}

            <div>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-h5 font-bold">{tk("admin.request.items")}</h2>
                <span className="num text-body text-ink-2">{items.length}</span>
              </div>
              <ol className="space-y-4">
                {items.map((it, idx) => {
                  const status = it.status as RequestItemStatus;
                  const qs = questions.filter((q) => q.request_item_id === it.id);
                  const itemLate = isOverdue(it.due_at, now);
                  return (
                    <li key={it.id} id={`item-${it.seq}`} className={`card scroll-mt-6 ${itemLate ? "border-crit" : ""}`}>
                      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
                        <span className="num text-h3 font-semibold leading-none">#{it.seq}</span>
                        <StatusPill entity="request_item" status={status} />
                        {it.owner_role && <span className="text-meta text-ink-2">{tk(`admin.queue.ownerRole.${it.owner_role}`)}</span>}
                        {it.assigned_to && <span className="text-meta text-ink-2">→ {staff.find((s) => s.id === it.assigned_to)?.name ?? it.assigned_to.slice(0, 8)}</span>}
                        <span className="ml-auto text-meta"><Due at={it.due_at} now={now} /></span>
                      </header>
                      <div className="space-y-4 px-5 py-4">
                        {images.some((i) => i.request_item_id === it.id) && imageGrid(images.filter((i) => i.request_item_id === it.id), it.id)}
                        <ItemPanel
                          item={it}
                          allowed={allowedNext("request_item", status, "ADMIN")}
                          editable={isEditableByAdmin(status)}
                          staff={staff}
                          siblings={targets.filter((t) => t.id !== it.id)}
                          defaultSla={defaultSla}
                          reasons={NEEDS_INFO_REASONS}
                        />
                        {qs.length > 0 && (
                          <div className="rounded-ui border border-warn bg-warn-soft/40 p-4">
                            <h3 className="eyebrow">{tk("admin.request.cnQuestions")} <span className="num text-ink">{qs.length}</span></h3>
                            {qs.map((q) => (
                              <div key={q.id} className="mt-2">
                                <CnQuestionGate q={{ ...q, options: (q.options ?? []) as GateQuestion["options"] }} />
                              </div>
                            ))}
                          </div>
                        )}
                        <details className="border-t border-line pt-3" open={itemThreads[idx].some((c) => c.visibility === "cn")}>
                          <summary className="cursor-pointer text-meta font-medium text-ink-2 hover:text-ink">{tk("comments.title")} <span className="num">{itemThreads[idx].length}</span></summary>
                          <div className="mt-2"><CommentThread targetType="request_item" targetId={it.id} viewer="admin" tabs={["cn", "brand", "internal"]} rows={itemThreads[idx]} /></div>
                        </details>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <Section title={tk("admin.request.split")}>
              <AddItemForm requestId={request.id} />
            </Section>
          </>
        }
        aside={
          <>
            <Section title={tk("admin.ui.overview")}>
              <Facts rows={[
                [tk("admin.requests.col.brand"), brand?.name],
                [tk("admin.request.itemsOpen"), <span key="o" className="num">{open} / {items.length}</span>],
                [tk("admin.ui.overdue"), <span key="l" className={`num ${late ? "font-semibold text-crit" : ""}`}>{late}</span>],
                [tk("admin.request.cnQuestions"), <span key="q" className="num">{questions.length}</span>],
              ]} />
              {items.length > 1 && (
                <nav aria-label={tk("admin.request.items")} className="mt-3 flex flex-wrap gap-1.5">
                  {items.map((it) => <a key={it.id} href={`#item-${it.seq}`} className={`chip ${isOverdue(it.due_at, now) ? "border-crit text-crit" : ""}`}>#{it.seq}</a>)}
                </nav>
              )}
            </Section>
            <Section title={tk("request.detail.timeline")}><Timeline rows={rows} /></Section>
            <Section title={tk("comments.title")}><CommentThread targetType="request" targetId={id} viewer="admin" tabs={["brand", "internal"]} rows={thread} /></Section>
          </>
        }
      />
    </div>
  );
}
