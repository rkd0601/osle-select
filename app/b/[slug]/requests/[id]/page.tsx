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
import { StatusDot } from "@/components/domain/status-pill";
import { HandoffCard } from "@/components/domain/handoff-card";
import { Figure } from "@/components/domain/figure";
import { handoffFor } from "@/lib/handoff";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { CnQuestionAnswer } from "./cn-question-answer";
import { Timeline, type TimelineRow } from "@/components/domain/timeline";
import { commentSummaryRows } from "@/lib/timeline-rows";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BackLink, shortId } from "../../_ui/list";
import { ItemActions } from "./item-actions";

/**
 * B-03 요청 상세 (디자인 v2 §5, 발주 상세와 같은 뼈대). 눈썹 `요청 · 날짜 · #id` → 제목 → 핸드오프 → 항목(번호 · 설명 · 상태 점, 1px 룰)
 * → 진행 기록 | 코멘트. 오른쪽: 진행 중 항목 · 제안 도착 숫자. 다른 브랜드 요청·없는 id 모두 404.
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
        tone: e.to === "needs_info" ? ("warn" as const) : ("default" as const),
      })),
    ...commentSummaryRows(comments, (n) => tk("timeline.comments", { n })), // 본문은 코멘트 칸에서만 (u-11)
    ...cnAnswered.map((q) => ({ at: q.at, label: `${tk("request.item", { n: seqOf.get(q.entityId) ?? "" })} · ${tk("timeline.cnAnsweredByAdmin")}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const brandTurn = items.filter((i) => i.owner_role === "BRAND" && i.due_at).sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0];
  const h = handoffFor("request", request.status);
  const openCount = items.filter((i) => !["closed", "cancelled"].includes(i.status)).length;
  const offeredCount = items.filter((i) => i.status === "offered" || i.status === "selected").length;

  return (
    <div>
      <BackLink href={`/b/${slug}/requests`} label={tk("nav.requests")} />
      <div className="two mt-5">
        <div className="stack min-w-0">
          <div>
            <div className="phead" style={{ borderBottom: 0, paddingBottom: 0 }}>
              <div className="min-w-0">
                <div className="eyebrow">{tk("request.detail.eyebrow", { date: fmtDate(request.created_at), id: shortId(request.id) })}</div>
                <h1 className="h1 mt-3">{request.title ?? tk("request.untitled")}</h1>
                <p className="sub flex flex-wrap items-center gap-x-3 gap-y-1">
                  <AuthorLine a={authorLabel(author, memberIds, author ? dir.get(author) : undefined)} />
                  {request.target_date && <span className="num text-meta">{tk("request.detail.targetDate", { date: fmtDate(request.target_date) })}</span>}
                  {request.created_via === "admin_proxy" && <span className="chip">{tk("request.proxyBadge")}</span>}
                </p>
              </div>
              <div className="shrink-0 pb-1.5"><StatusDot entity="request" status={request.status} /></div>
            </div>
            {h && (
              <div className="mt-7">
                <HandoffCard
                  owner={h.owner}
                  due={h.owner === "BRAND" ? (brandTurn?.due_at ?? null) : null}
                  title={tk(h.title)}
                  decide={tk(h.decide)}
                  cta={h.cta === "offers" && h.ctaLabel ? { href: `/b/${slug}/offers`, label: tk(h.ctaLabel) } : undefined}
                />
              </div>
            )}
          </div>

          {request.memo && <p className="-mt-4 whitespace-pre-wrap text-lead text-ink-2">{request.memo}</p>}

          <section>
            <div className="section-h"><h2>{tk("request.detail.items")}<span className="count">{items.length}</span></h2></div>
            <ol>
              {items.map((it) => {
                const imgs = images.filter((i) => i.request_item_id === it.id);
                const next = allowedNext("request_item", it.status, user.role);
                const reason = comments.filter((c) => c.target_id === it.id).at(-1);
                const mineItem = it.owner_role === "BRAND" && !["closed", "cancelled"].includes(it.status);
                return (
                  <li key={it.id} className={`border-b border-line py-6 ${mineItem ? "border-l-2 border-l-gold pl-5" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-baseline gap-5">
                        <span className="num text-h1 font-light leading-none text-ink">{String(it.seq).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <p className="text-lead font-medium">{it.description}</p>
                          <p className="num mt-1 flex flex-wrap gap-x-3 text-meta text-ink-2">
                            {it.category && <span>{it.category}</span>}
                            {it.expected_qty_range && <span>{tk(`qtyRange.${it.expected_qty_range}`)}</span>}
                            {it.target_price_krw ? <span>₩{krw(it.target_price_krw)}</span> : null}
                            {it.expected_offer_date && (it.status === "assigned" || it.status === "sourcing") && <span>{tk("request.detail.expectedOffer", { date: fmtDate(it.expected_offer_date) })}</span>}
                          </p>
                        </div>
                      </div>
                      <StatusDot entity="request_item" status={it.status} />
                    </div>
                    {imgs.length > 0 && (
                      <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {imgs.map((img) =>
                          img.storage_path ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                            <img key={img.id} src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full bg-well object-cover" />
                          ) : (
                            <a key={img.id} href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="col-span-2 flex aspect-[3/2] items-center break-all border border-line p-3 text-caption text-ink-2 underline underline-offset-2 hover:text-ink">
                              {img.source_url}
                            </a>
                          ),
                        )}
                      </div>
                    )}
                    {it.status === "needs_info" && reason && <p className="mt-5 border-l-2 border-warn pl-4 text-body">{reason.body_ko}</p>}
                    {questions.filter((q) => q.request_item_id === it.id).map((q) => (
                      <div key={q.id} className="mt-5">
                        <p className="label mb-2">{tk("cnq.title")}</p>
                        <CnQuestionAnswer brandId={brand.id} q={{ ...q, options_ko: (q.options_ko ?? []) as (string | null)[] }} />
                      </div>
                    ))}
                    {(it.status === "offered" || it.status === "selected") && (
                      <Link href={`/b/${slug}/offers`} className="link mt-5 inline-block">{tk("home.viewLinesheet")}</Link>
                    )}
                    <div className="mt-4 empty:hidden">
                      <ItemActions brandId={brand.id} itemId={it.id} canCancel={next.includes("cancelled")} canSupply={it.status === "needs_info" && next.includes("received")} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="two half">
            <section>
              <div className="section-h" style={{ borderBottom: 0, paddingBottom: 16 }}><h2>{tk("request.detail.timeline")}</h2></div>
              <Timeline rows={rows} />
            </section>
            <CommentThread targetType="request" targetId={request.id} viewer="brand" tabs={["brand"]} rows={thread} />
          </div>
        </div>

        <aside className="stack min-w-0" style={{ gap: 40 }}>
          <Figure first label={tk("request.detail.sumOpen")} value={openCount} dim={openCount === 0} />
          <Figure label={tk("request.detail.sumOffered")} value={offeredCount} dim={offeredCount === 0}
            help={offeredCount ? <Link href={`/b/${slug}/offers`} className="link">{tk("home.toOffers")}</Link> : null} />
        </aside>
      </div>
    </div>
  );
}
