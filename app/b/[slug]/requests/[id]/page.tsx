import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandRequest, offersForRequestItems } from "@/lib/db/brand/requests";
import { cnAnsweredByAdmin, transitionEvents } from "@/lib/timeline";
import { brandMemberIds } from "@/lib/db/brand/settings";
import { memberDirectory } from "@/lib/db/users";
import { authorLabel } from "@/lib/authors";
import { AuthorLine } from "@/components/domain/author-line";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { NowBlock } from "@/components/domain/todo-row";
import { Figure } from "@/components/domain/figure";
import { handoffFor } from "@/lib/handoff";
import { oneLine } from "@/lib/brand-state";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { CnQuestionAnswer } from "./cn-question-answer";
import { Timeline, type TimelineRow } from "@/components/domain/timeline";
import { commentSummaryRows } from "@/lib/timeline-rows";
import { fmtDay, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BackLink } from "../../_ui/list";
import { ItemActions } from "./item-actions";

/**
 * B-03 요청 상세 (디자인 v2.2 — 발주 상세와 같은 뼈대). 12칸: 왼쪽 8 — 메타 13("요청 · 11월 1일 · 희망 제안일 …") · 제목 28 →
 * 지금 상태 블록(`.nowblock`) → 항목(번호 · 설명 · 지금 한 문장 · 사진·링크 · 보완/질문/제안 보기) → "지금까지" | "위아더에게".
 * 오른쪽 4 — 진행 중 항목 · 제안 도착 숫자. 상태 점·눈썹·#id·금색 룰 없음(d-11). 다른 브랜드 요청·없는 id 모두 404.
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
  const [events, thread, cnAnswered, memberIds, dir, offers] = await Promise.all([
    transitionEvents("request_item", items.map((i) => i.id)),
    brandThread(brand.id, user.id, "request", request.id),
    cnAnsweredByAdmin(items.map((i) => i.id)),
    brandMemberIds(brand.id),
    memberDirectory(author ? [author] : []),
    offersForRequestItems(brand.id, items.map((i) => i.id)),
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
  const liveOffer = (itemId: string) => offers.find((x) => x.request_item_id === itemId && !["expired", "declined"].includes(x.status)) ?? offers.find((x) => x.request_item_id === itemId);
  const firstPhoto = images.find((i) => i.storage_path)?.storage_path ?? null;
  const nowSub = oneLine([
    h ? tk(h.decide) : null,
    h?.owner === "BRAND" && brandTurn?.due_at ? tk("state.until", { date: fmtDay(brandTurn.due_at) }) : null,
  ]);
  const meta = [
    tk("request.detail.meta", { date: fmtDay(request.created_at) }),
    request.target_date ? tk("request.detail.targetOn", { date: fmtDay(request.target_date) }) : null,
    request.created_via === "admin_proxy" ? tk("request.proxyBadge") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8 min-w-0">
        <p className="meta flex flex-wrap gap-x-2">
          <span>{meta}</span>
          <AuthorLine a={authorLabel(author, memberIds, author ? dir.get(author) : undefined)} />
        </p>
        <h1 className="h1 mt-2.5">{request.title ?? tk("request.untitled")}</h1>
        <NowBlock photo={firstPhoto ? urls[firstPhoto] ?? null : null} title={tk(`state.request.${request.status}`)} sub={nowSub} />
        {request.memo && <p className="lead mt-6 whitespace-pre-wrap">{request.memo}</p>}

        <section className="mt-10">
          <div className="section-h"><h2>{tk("request.detail.items")}<span className="count">{items.length}</span></h2></div>
          <ol>
            {items.map((it) => {
              const imgs = images.filter((i) => i.request_item_id === it.id);
              const next = allowedNext("request_item", it.status, user.role);
              const reason = comments.filter((c) => c.target_id === it.id).at(-1);
              const offer = it.status === "offered" || it.status === "selected" ? liveOffer(it.id) : undefined;
              const facts = [
                it.category,
                it.expected_qty_range ? tk(`qtyRange.${it.expected_qty_range}`) : null,
                it.target_price_krw ? `₩${krw(it.target_price_krw)}` : null,
              ].filter(Boolean).join(" · ");
              const nowLine = [
                tk(`state.request.${it.status}`),
                it.expected_offer_date && (it.status === "assigned" || it.status === "sourcing") ? tk("request.detail.expectedOffer", { date: fmtDay(it.expected_offer_date) }) : null,
              ].filter(Boolean).join(" · ");
              return (
                <li key={it.id} className="border-b border-line py-6">
                  <div className="flex min-w-0 items-baseline gap-5">
                    <span className="num text-h1 font-light leading-none text-ink">{String(it.seq).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-lead font-medium">{it.description}</p>
                      {facts && <p className="num mt-1 text-meta text-ink-2">{facts}</p>}
                      <p className={`mt-1 text-meta ${it.status === "needs_info" ? "text-warn" : "text-ink-2"}`}>{nowLine}</p>
                    </div>
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
                    <Link href={offer ? `/b/${slug}/offers/${offer.id}` : `/b/${slug}/progress?f=offer`} className="btn sec sm mt-5">{tk("request.detail.viewOffer")}</Link>
                  )}
                  <div className="mt-4 empty:hidden">
                    <ItemActions brandId={brand.id} itemId={it.id} canCancel={next.includes("cancelled")} canSupply={it.status === "needs_info" && next.includes("received")} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="two half mt-12">
          <section>
            <div className="section-h" style={{ borderBottom: 0, paddingBottom: 12 }}><h2>{tk("detail.sofar")}</h2></div>
            <Timeline day rows={rows} />
          </section>
          <CommentThread targetType="request" targetId={request.id} viewer="brand" tabs={["brand"]} rows={thread} title={tk("detail.toWeare")} />
        </div>
      </div>

      <aside className="c4 min-w-0 stack" style={{ gap: 40 }}>
        <Figure label={tk("request.detail.sumOpen")} value={openCount} dim={openCount === 0} />
        <Figure label={tk("request.detail.sumOffered")} value={offeredCount} dim={offeredCount === 0}
          help={offeredCount ? <Link href={`/b/${slug}/progress?f=offer`} className="link">{tk("request.detail.viewOffer")}</Link> : null} />
      </aside>
    </div>
  );
}
