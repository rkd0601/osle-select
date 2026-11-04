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
import { Figure } from "@/components/domain/figure";
import { PhotoCard } from "@/components/domain/photo-card";
import { listBrandProgress, type ProgressItem } from "@/lib/db/brand/progress";
import { hasBatchim, itemPhase, pickItemCards, shortName } from "@/lib/requests";
import { oneLine } from "@/lib/brand-state";
import { itemName } from "@/lib/brand-progress";
import { CommentThread } from "@/components/domain/comment-thread";
import { brandThread } from "@/lib/db/comments";
import { CnQuestionAnswer } from "./cn-question-answer";
import { Timeline, type TimelineRow } from "@/components/domain/timeline";
import { commentSummaryRows } from "@/lib/timeline-rows";
import { fmtDay, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BackLink } from "../../_ui/list";
import { CancelItemButton, ItemActions } from "./item-actions";

const DAY = 86400000;
const plusDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY);
/** 항목 사진 줄: 8칸 소그리드(본문 c8과 같은 24px 간격) — 사진 한 장 = 한 칸, 링크 = 두 칸 (정렬 규칙 v2.3) */
const PHOTO_GRID = { display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: "16px 24px" } as const;

/**
 * B-03 요청 상세 (디자인 v2.2 — 발주 상세와 같은 뼈대). 12칸: 왼쪽 8 — 메타 13("요청 · 11월 1일 · 희망 제안일 …") · 제목 28 →
 * 지금 상태 블록(`.nowblock`) → 항목(번호 · 설명 · 지금 한 문장 · 사진·링크 · 보완/질문/제안 보기) → "지금까지" | "위아더에게".
 * 오른쪽 4 — 진행 중 항목 · 제안 도착 숫자. 상태 점·눈썹·#id·금색 룰 없음(d-11). 다른 브랜드 요청·없는 id 모두 404.
 * 지금 상태(3차 검증 T2): 항목마다 진행 카드(제안·샘플·발주) 중 대표 1장으로 문장을 만든다("1번 자켓은 발주 진행 · 2번 롱 코트는 찾는 중").
 * `?submitted=1`(요청 작성 직후)이면 접수 완료 화면(v2.3, 프로토타입 v-submitted)을 대신 보여 준다.
 */
export default async function RequestDetail({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { slug, id } = await params;
  const { submitted } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand } = await requireBrandMember(slug);
  const data = await getBrandRequest(brand.id, id);
  if (!data) notFound();
  const { request, items, images, comments, questions } = data;
  const urls = await signedReadUrls("requestImages", images.flatMap((i) => (i.storage_path ? [i.storage_path] : [])));
  const seqOf = new Map(items.map((i) => [i.id, i.seq]));

  if (submitted === "1") {
    const first = items[0];
    const firstImg = first ? images.find((i) => i.request_item_id === first.id && i.storage_path)?.storage_path : null;
    const offerBy = request.target_date ?? plusDays(request.created_at, 10);
    return (
      <div className="g12">
        <div className="c8">
          <h1 className="display">{tk("submitted.title")}</h1>
          <span className="goldrule" />
          <p className="lead" style={{ marginTop: 20 }}>
            {request.target_date ? tk("submitted.lead", { n: items.length, date: fmtDay(request.target_date) }) : tk("submitted.leadNoDate", { n: items.length })}
          </p>
        </div>
        <div className="c4" />
        <div className="c8 min-w-0">
          <ul className="tl big">
            <li className="now"><span className="when">{tk("submitted.now")}</span><span className="what">{tk("submitted.step1")}</span></li>
            <li><span className="when">{tk("submitted.by", { date: fmtDay(plusDays(request.created_at, 5)) })}</span><span className="what">{tk("submitted.step2")}</span></li>
            <li><span className="when">{tk("submitted.by", { date: fmtDay(offerBy) })}</span><span className="what">{tk("submitted.step3")}</span></li>
          </ul>
          {/* 버튼 둘을 8칸 소그리드의 3칸씩에 — 왼쪽·오른쪽 모서리가 그리드 선에 온다 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", columnGap: 24, marginTop: 32 }}>
            <Link href={`/b/${slug}/progress`} className="btn" style={{ gridColumn: "span 3" }}>{tk("submitted.toProgress")}</Link>
            <Link href={`/b/${slug}/requests/new`} className="btn sec" style={{ gridColumn: "span 3" }}>{tk("submitted.more")}</Link>
          </div>
        </div>
        <aside className="c4 min-w-0">
          {first && (
            <PhotoCard href={`/b/${slug}/requests/${request.id}`} photo={firstImg ? urls[firstImg] ?? null : null}
              name={itemName(first.description, request.title) || first.description} state={tk(`state.request.${first.status}`)} emptyLabel={tk("request.style.n", { n: 1 })} />
          )}
        </aside>
      </div>
    );
  }

  const author = request.created_by as string | null;
  const [events, thread, cnAnswered, memberIds, dir, offers, progress] = await Promise.all([
    transitionEvents("request_item", items.map((i) => i.id)),
    brandThread(brand.id, user.id, "request", request.id),
    cnAnsweredByAdmin(items.map((i) => i.id)),
    brandMemberIds(brand.id),
    memberDirectory(author ? [author] : []),
    offersForRequestItems(brand.id, items.map((i) => i.id)),
    listBrandProgress(brand.id).then((cs) => cs.filter((c) => c.requestId === request.id)),
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

  // 지금 상태(T2): 항목마다 대표 카드 1장 → 짧은 문장. 취소된 항목은 다른 항목이 있으면 뺀다.
  type Item = (typeof items)[number];
  const picked = pickItemCards<ProgressItem>(progress);
  const cardOf = (it: Item) => picked.get(it.id);
  const shown = items.some((i) => i.status !== "cancelled") ? items.filter((i) => i.status !== "cancelled") : items;
  const phraseOf = (it: Item) => {
    const c = cardOf(it);
    const name = shortName(c?.name || itemName(it.description, request.title) || "");
    const phase = itemPhase(c ?? { requestItemId: it.id, kind: "request", stage: 1, done: false, stateKey: `state.request.${it.status}` });
    return tk("request.detail.itemPhase", {
      n: it.seq, name, phase: tk(`request.detail.phase.${phase}`),
      josa: tk(hasBatchim(name) ? "request.detail.josa.batchim" : "request.detail.josa.plain"),
    });
  };
  const stateOf = (it: Item) => {
    const c = cardOf(it);
    return c ? tk(c.stateKey) : tk(`state.request.${it.status}`);
  };
  const mineItem = shown.find((i) => cardOf(i)?.mine);
  const mineCard = mineItem ? cardOf(mineItem) : undefined;
  const nowTitle = shown.length === 1
    ? stateOf(shown[0])
    : [...shown.slice(0, 3).map(phraseOf), shown.length > 3 ? tk("request.detail.phaseMore", { n: shown.length - 3 }) : null].filter(Boolean).join(" · ");
  const nowSub = mineItem && mineCard
    ? oneLine([
        shown.length > 1 ? tk("request.detail.mineLine", { n: mineItem.seq, state: tk(mineCard.stateKey) }) : null,
        mineCard.due ? tk("state.until", { date: fmtDay(mineCard.due) }) : null,
      ])
    : null;
  const nowPhoto = shown.map((i) => cardOf(i)?.photo).find(Boolean) ?? null;
  const openCount = items.filter((i) => !["closed", "cancelled"].includes(i.status)).length;
  const offeredCount = items.filter((i) => i.status === "offered" || i.status === "selected").length;
  const liveOffer = (itemId: string) => offers.find((x) => x.request_item_id === itemId && !["expired", "declined"].includes(x.status)) ?? offers.find((x) => x.request_item_id === itemId);
  const firstPhoto = images.find((i) => i.storage_path)?.storage_path ?? null;
  const thumb = nowPhoto ?? (firstPhoto ? urls[firstPhoto] ?? null : null);
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
        <section className="nowblock">
          <span className={`thumb ${thumb ? "" : "empty-photo"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
            {thumb && <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          </span>
          <div className="min-w-0">
            <div className="t">{nowTitle}</div>
            {nowSub && <p className="s">{nowSub}</p>}
          </div>
        </section>
        {request.memo && <p className="lead mt-6 whitespace-pre-wrap">{request.memo}</p>}

        <section className="mt-10">
          <div className="section-h"><h2>{tk("request.detail.items")}<span className="count">{items.length}</span></h2></div>
          <ol>
            {items.map((it) => {
              const imgs = images.filter((i) => i.request_item_id === it.id);
              const next = allowedNext("request_item", it.status, user.role);
              const reason = comments.filter((c) => c.target_id === it.id).at(-1);
              const offer = it.status === "offered" || it.status === "selected" ? liveOffer(it.id) : undefined;
              const card = cardOf(it);
              const viewKey = card?.kind === "order" ? "request.detail.viewOrder" : card?.kind === "sample" ? "request.detail.viewSample" : "request.detail.viewOffer";
              const viewHref = card && card.kind !== "request" ? `/b/${slug}${card.href}`
                : it.status === "offered" || it.status === "selected" ? (offer ? `/b/${slug}/offers/${offer.id}` : `/b/${slug}/progress?f=offer`) : null;
              const facts = [
                it.category,
                it.expected_qty_range ? tk(`qtyRange.${it.expected_qty_range}`) : null,
                it.target_price_krw ? `₩${krw(it.target_price_krw)}` : null,
              ].filter(Boolean).join(" · ");
              const nowLine = [
                stateOf(it),
                card?.mine && card.due ? tk("state.until", { date: fmtDay(card.due) }) : null,
                (!card || card.kind === "request") && it.expected_offer_date && (it.status === "assigned" || it.status === "sourcing") ? tk("request.detail.expectedOffer", { date: fmtDay(it.expected_offer_date) }) : null,
              ].filter(Boolean).join(" · ");
              return (
                <li key={it.id} className="border-b border-line py-6">
                  <div className={`req-item-row ${next.includes("cancelled") ? "has-cancel" : ""}`}>
                    <span className="num text-h1 font-light leading-none text-ink">{String(it.seq).padStart(2, "0")}</span>
                    <div className="body">
                      <p className="text-lead font-medium">{it.description}</p>
                      {facts && <p className="num mt-1 text-meta text-ink-2">{facts}</p>}
                      <p className={`mt-1 text-meta ${it.status === "needs_info" ? "text-warn" : "text-ink-2"}`}>{nowLine}</p>
                    </div>
                    {next.includes("cancelled") && <span className="end"><CancelItemButton brandId={brand.id} itemId={it.id} /></span>}
                  </div>
                  {imgs.length > 0 && (
                    <div className="mt-5" style={PHOTO_GRID}>
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
                  {viewHref && <Link href={viewHref} className="btn sec sm mt-5">{tk(viewKey)}</Link>}
                  <div className="mt-4 empty:hidden">
                    <ItemActions brandId={brand.id} itemId={it.id} canSupply={it.status === "needs_info" && next.includes("received")} />
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
