import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandRequest } from "@/lib/db/brand/requests";
import { cnAnsweredByAdmin, transitionEvents } from "@/lib/timeline";
import { brandMemberIds } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { authorLabel } from "@/lib/authors";
import { AuthorLine } from "@/components/domain/author-line";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { StatusPill } from "@/components/domain/status-pill";
import { HandoffCard } from "@/components/domain/handoff-card";
import { handoffFor } from "@/lib/handoff";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { CnQuestionAnswer } from "./cn-question-answer";
import { Timeline, type TimelineRow } from "@/components/domain/timeline";
import { commentSummaryRows } from "@/lib/timeline-rows";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ItemActions } from "./item-actions";

/**
 * B-03 요청 상세: 핸드오프 카드 + 항목별 상태(카드) + 오른쪽 요약·타임라인·메시지. 다른 브랜드 요청·없는 id 모두 404.
 * 데스크톱 2단(본문 + 옆 칸), 모바일 1단. 브랜드 차례 항목은 시그니처 왼쪽 띠.
 */
export default async function RequestDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand } = await requireBrandMember(slug);
  const data = await getBrandRequest(brand.id, id);
  if (!data) notFound();
  const { request, items, images, comments, questions } = data;
  const urls = await signedReadUrls("requestImages", images.flatMap((i) => (i.storage_path ? [i.storage_path] : [])));
  const seqOf = new Map(items.map((i) => [i.id, i.seq]));

  const author = request.created_by as string | null;
  const [events, thread, cnAnswered, memberIds, dir] = await Promise.all([
    transitionEvents("request_item", items.map((i) => i.id)),
    brandThread(brand.id, user.id, "request", request.id),
    cnAnsweredByAdmin(items.map((i) => i.id)),
    brandMemberIds(brand.id),
    memberDirectory(author ? [author] : []),
  ]);
  const rows: TimelineRow[] = [
    { at: request.created_at, label: tk("timeline.created") },
    ...events
      .filter((e) => e.kind === "transition")
      .map((e) => ({
        at: e.at,
        label: `${tk("request.item", { n: seqOf.get(e.entityId) ?? "" })} · ${tk(`status.request_item.${e.to}`)}`,
        tone: e.to === "needs_info" ? ("warn" as const) : e.to === "offered" ? ("brand" as const) : ("default" as const),
      })),
    ...commentSummaryRows(comments, (n) => tk("timeline.comments", { n })), // 본문은 아래 코멘트 칸에서만 (u-11)
    ...cnAnswered.map((q) => ({ at: q.at, label: `${tk("request.item", { n: seqOf.get(q.entityId) ?? "" })} · ${tk("timeline.cnAnsweredByAdmin")}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const brandTurn = items.filter((i) => i.owner_role === "BRAND" && i.due_at).sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0];
  const h = handoffFor("request", request.status);
  const openCount = items.filter((i) => !["closed", "cancelled"].includes(i.status)).length;
  const offeredCount = items.filter((i) => i.status === "offered" || i.status === "selected").length;

  return (
    <div className="space-y-6">
      <Link href={`/b/${slug}/requests`} className="btn btn-ghost btn-sm -ml-2">{tk("common.back")}</Link>
      <header className="border-b border-ink pb-4">
        <div className="eyebrow">{tk("request.detail.eyebrow", { date: fmtDate(request.created_at) })}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-title font-bold tracking-tight">{request.title ?? tk("request.untitled")}</h1>
          <StatusPill entity="request" status={request.status} />
          {request.created_via === "admin_proxy" && <span className="rounded-full bg-sand px-2 py-0.5 text-caption text-ink-2">{tk("request.proxyBadge")}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-2">
          <AuthorLine a={authorLabel(author, memberIds, author ? dir.get(author) : undefined)} />
          {request.target_date && <span className="num">{tk("request.field.targetDate")} {fmtDate(request.target_date)}</span>}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          {request.memo && <p className="whitespace-pre-wrap text-lead text-ink-2">{request.memo}</p>}

          {h && (
            <HandoffCard
              owner={h.owner}
              due={h.owner === "BRAND" ? (brandTurn?.due_at ?? null) : null}
              title={tk(h.title)}
              decide={tk(h.decide)}
              cta={h.cta === "offers" && h.ctaLabel ? { href: `/b/${slug}/offers`, label: tk(h.ctaLabel) } : undefined}
            />
          )}

          <section>
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <h2 className="eyebrow">{tk("request.detail.items")}</h2>
              <span className="num text-caption text-ink-2">{tk("request.list.items", { n: items.length })}</span>
            </div>
            <ol className="mt-4 space-y-4">
              {items.map((it) => {
                const imgs = images.filter((i) => i.request_item_id === it.id);
                const next = allowedNext("request_item", it.status, user.role);
                const reason = comments.filter((c) => c.target_id === it.id).at(-1);
                const mineItem = it.owner_role === "BRAND" && !["closed", "cancelled"].includes(it.status);
                return (
                  <li key={it.id} className="card card-pad relative overflow-hidden">
                    {mineItem && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signature" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-baseline gap-4">
                        <span className="num text-h1-s font-semibold leading-none text-ink">{String(it.seq).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <p className="text-strong font-semibold">{it.description}</p>
                          <p className="num mt-1 flex flex-wrap gap-x-3 text-meta text-ink-2">
                            {it.category && <span>{it.category}</span>}
                            {it.expected_qty_range && <span>{tk(`qtyRange.${it.expected_qty_range}`)}</span>}
                            {it.target_price_krw ? <span>₩{krw(it.target_price_krw)}</span> : null}
                          </p>
                        </div>
                      </div>
                      <StatusPill entity="request_item" status={it.status} />
                    </div>
                    {imgs.length > 0 && (
                      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {imgs.map((img) =>
                          img.storage_path ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                            <img key={img.id} src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full rounded-ui bg-sand object-cover" />
                          ) : (
                            <a key={img.id} href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="col-span-2 flex aspect-[3/2] items-center break-all rounded-ui border border-line bg-paper p-2 text-caption text-ink-2 underline">
                              {img.source_url}
                            </a>
                          ),
                        )}
                      </div>
                    )}
                    {it.expected_offer_date && (it.status === "assigned" || it.status === "sourcing") && (
                      <p className="num mt-3 text-meta text-ink-2">{tk("request.detail.expectedOffer", { date: fmtDate(it.expected_offer_date) })}</p>
                    )}
                    {it.status === "needs_info" && reason && <p className="mt-4 rounded-ui border-l-2 border-warn bg-warn-soft/50 px-3 py-2 text-body">{reason.body_ko}</p>}
                    {questions.filter((q) => q.request_item_id === it.id).map((q) => (
                      <div key={q.id} className="mt-4">
                        <p className="eyebrow mb-1.5">{tk("cnq.title")}</p>
                        <CnQuestionAnswer brandId={brand.id} q={{ ...q, options_ko: (q.options_ko ?? []) as (string | null)[] }} />
                      </div>
                    ))}
                    {(it.status === "offered" || it.status === "selected") && (
                      <Link href={`/b/${slug}/offers`} className="mt-4 inline-block text-meta font-medium text-signature underline-offset-4 hover:underline">{tk("home.viewLinesheet")}</Link>
                    )}
                    <div className="mt-3">
                      <ItemActions brandId={brand.id} itemId={it.id} canCancel={next.includes("cancelled")} canSupply={it.status === "needs_info" && next.includes("received")} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card card-pad">
            <h2 className="eyebrow">{tk("request.detail.summary")}</h2>
            <dl className="num mt-3 grid grid-cols-3 gap-3 text-center">
              <div><dt className="text-caption text-ink-2">{tk("request.detail.sumItems")}</dt><dd className="mt-1 text-h2 font-semibold">{items.length}</dd></div>
              <div><dt className="text-caption text-ink-2">{tk("request.detail.sumOpen")}</dt><dd className="mt-1 text-h2 font-semibold">{openCount}</dd></div>
              <div><dt className="text-caption text-ink-2">{tk("request.detail.sumOffered")}</dt><dd className={`mt-1 text-h2 font-semibold ${offeredCount ? "text-signature" : ""}`}>{offeredCount}</dd></div>
            </dl>
          </section>
          <section className="card card-pad">
            <h2 className="eyebrow">{tk("request.detail.timeline")}</h2>
            <div className="mt-4">
              <Timeline rows={rows} />
            </div>
          </section>
          <div className="card card-pad">
            <CommentThread targetType="request" targetId={request.id} viewer="brand" tabs={["brand"]} rows={thread} />
          </div>
        </aside>
      </div>
    </div>
  );
}
