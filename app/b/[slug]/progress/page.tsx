import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { tk } from "@/lib/i18n";
import { fmtDay } from "@/lib/format";
import { listBrandProgress, RECOMMEND_GROUP, type ProgressItem } from "@/lib/db/brand/progress";
import { cartCards, cartHref, filterCounts, groupCards, type ProgressFilter } from "@/lib/brand-progress";
import { PhotoCard } from "@/components/domain/photo-card";
import { cardAction, cardEm, cardPill, cardState } from "./card-text";
import { QuickReact } from "./quick-react";
import { FirstOfferBanner } from "./first-offer-banner";

/**
 * 진행 (디자인 v2.2 §5 "진행", DECISIONS d-6·d-9·d-11) — 요청·제안·샘플·발주를 한 화면에.
 * "진행 중인 상품 n" / 라인시트 PDF · 상품 요청 → 칩(사람 말 + 건수, ?f=) → 요청 묶음마다 섹션 머리 + 사진 카드 3칸.
 * 새 제안 카드만 버튼("관심 · 샘플에 담기"/"보류", 기존 reactToOffer). 관심 표시 뒤 샘플 전인 제안이 있으면 하단 담김 바.
 * 체크박스·트랙·상태 점·코드 없음. 데이터는 listBrandProgress(브랜드 뷰만, 규칙 1). 화면에 쓰는 필드만 클라이언트로 넘긴다.
 */
const FILTERS = ["mine", "offer", "sample", "order", "done"] as const;
const COLLAPSE_OVER = 20;

export default async function ProgressPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ f?: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const { f: rawF } = await searchParams;
  const f = (FILTERS as readonly string[]).includes(rawF ?? "") ? (rawF as ProgressFilter) : null;
  const base = `/b/${brand.slug}`;

  const all = await listBrandProgress(brand.id);
  const counts = filterCounts(all);
  const open = all.filter((c) => !c.done);
  const shown = f ? all.filter((c) => c.filters.includes(f)) : open;

  // 요청 묶음(D2, d-18): 할 일 있는 묶음 → 최근 활동순, 추천은 맨 아래. 묶음 안은 카드 정렬(할 일 → 기한 → 최근) 그대로
  const itemsOf = new Map<string, Set<string>>();
  for (const c of all) (itemsOf.get(c.requestId) ?? itemsOf.set(c.requestId, new Set()).get(c.requestId)!).add(c.requestItemId);
  const ordered = groupCards(shown, RECOMMEND_GROUP, (c) => c.reqCreatedAt);
  const many = ordered.length > COLLAPSE_OVER;
  // 라인시트 PDF(D10): 제안이 1건 이상일 때만
  const hasOffer = all.some((c) => c.offerId);

  // 담김 바: 관심 표시했고 아직 샘플 요청서가 없는 제안(샘플이 생기면 카드가 샘플 카드로 바뀐다)
  const picked = cartCards(all); // 홈 할 일 "샘플 요청서를 보내 주세요"와 같은 기준 (H1)
  const pickedNames = picked.slice(0, 3).map((c) => c.name).join(", ");
  const [leadA, leadB] = tk("progress.selbar.lead", { n: "\u0000" }).split("\u0000");

  const chip = (key: ProgressFilter | null, label: string, n?: number) => {
    const on = f === key;
    return (
      <Link key={key ?? "all"} href={key ? `${base}/progress?f=${key}` : `${base}/progress`} className={`chip${on ? " on" : ""}`} aria-current={on ? "true" : undefined}>
        {label}{n != null && n > 0 ? ` ${n}` : ""}
      </Link>
    );
  };

  const card = (c: ProgressItem) => (
    <PhotoCard
      key={c.key} className="c3" href={`${base}${c.href}`} photo={c.photo} name={c.name} em={cardEm(c)} state={cardState(c)} pill={cardPill(c)}
      emptyLabel={tk("progress.noPhoto")} action={cardAction(c, base)}
    >
      {c.kind === "offer" && c.isNew && c.offerId ? <QuickReact brandId={brand.id} offerId={c.offerId} name={c.name} /> : null}
    </PhotoCard>
  );

  const head = (cards: ProgressItem[]) => {
    const first = cards[0];
    if (first.requestId === RECOMMEND_GROUP) {
      return <h2>{tk("progress.group.recommend")}<span className="count">{tk("progress.group.recommendHelp")}</span></h2>;
    }
    const validUntil = cards.filter((c) => c.kind === "offer" && !c.done).map((c) => c.exclusiveUntil ?? c.validUntil).filter(Boolean).sort()[0];
    return (
      <>
        <h2>
          {first.requestTitle || tk("request.untitled")}
          <span className="count">{tk("progress.group.count", { date: fmtDay(first.reqCreatedAt), n: itemsOf.get(first.requestId)?.size ?? 0 })}</span>
        </h2>
        {validUntil && <span className="meta">{tk("progress.group.valid", { date: fmtDay(validUntil) })}</span>}
      </>
    );
  };

  return (
    <>
      <div className="g12">
        <div className="c8"><h1 className="h1">{tk("progress.title")} <span className="num thin">{open.length}</span></h1></div>
        <div className="c4 tr">
          {hasOffer && <Link href={`${base}/offers/print`} className="btn sec">{tk("linesheet.pdf")}</Link>}
          <Link href={`${base}/requests/new`} className="btn">{tk("progress.request")}</Link>
        </div>
        <nav className="c12 chips" aria-label={tk("progress.chips")}>
          {chip(null, tk("progress.chip.all"))}
          {chip("mine", tk("progress.chip.mine"), counts.mine)}
          {chip("offer", tk("progress.chip.offer"), counts.offer)}
          {chip("sample", tk("progress.chip.sample"), counts.sample)}
          {chip("order", tk("progress.chip.order"), counts.order)}
          {chip("done", tk("progress.chip.done"))}
        </nav>

        {all.some((c) => c.kind === "offer" && c.isNew) && <FirstOfferBanner brandId={brand.id} />}

        {ordered.length === 0 && <p className="c12 text-meta text-ink-2">{tk(f ? "progress.emptyFilter" : "progress.empty")}</p>}

        {ordered.map((cards, i) =>
          many ? (
            <details key={cards[0].requestId} className="c12" open={cards.some((c) => c.mine)}>
              <summary className="section-h cursor-pointer list-none [&::-webkit-details-marker]:hidden">{head(cards)}</summary>
              <div className="g12 mt-8">{cards.map(card)}</div>
            </details>
          ) : (
            <Group key={cards[0].requestId} first={i === 0} head={head(cards)}>{cards.map(card)}</Group>
          ),
        )}
      </div>

      {picked.length > 0 && (
        <div className="selbar z-10 mt-8">
          <div className="g12" style={{ rowGap: 12, paddingInline: 24 }}>
            <div className="c8 meta" style={{ alignSelf: "center" }}>
              {leadA}<b className="num">{picked.length}</b>{leadB}
              {pickedNames && ` · ${picked.length > 3 ? tk("progress.selbar.more", { names: pickedNames, n: picked.length - 3 }) : pickedNames}`}
            </div>
            <div className="c4 tr">
              <Link href={`${base}${cartHref(picked)}`} className="btn">{tk("progress.selbar.go")}</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 묶음 하나: 섹션 머리(c12) + 카드들(같은 12칸 그리드에 그대로) */
function Group({ first, head, children }: { first: boolean; head: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="c12 section-h" style={first ? undefined : { marginTop: 32 }}>{head}</div>
      {children}
    </>
  );
}
