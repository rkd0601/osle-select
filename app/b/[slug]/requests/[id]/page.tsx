import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBrandMember } from "@/lib/auth/session";
import { getBrandRequest } from "@/lib/db/brand/requests";
import { transitionEvents } from "@/lib/timeline";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { StatusPill } from "@/components/domain/status-pill";
import { HandoffCard } from "@/components/domain/handoff-card";
import { Timeline, type TimelineRow } from "@/components/domain/timeline";
import { fmtDate, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ItemActions } from "./item-actions";

/** B-03 요청 상세: 핸드오프 카드 + 항목별 상태 + 타임라인. 다른 브랜드 요청·없는 id 모두 404. */
export default async function RequestDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { user, brand } = await requireBrandMember(slug);
  const data = await getBrandRequest(brand.id, id);
  if (!data) notFound();
  const { request, items, images, comments } = data;
  const urls = await signedReadUrls("requestImages", images.flatMap((i) => (i.storage_path ? [i.storage_path] : [])));
  const seqOf = new Map(items.map((i) => [i.id, i.seq]));

  const events = await transitionEvents("request_item", items.map((i) => i.id));
  const rows: TimelineRow[] = [
    { at: request.created_at, label: tk("timeline.created") },
    ...events
      .filter((e) => e.kind === "transition")
      .map((e) => ({
        at: e.at,
        label: `${tk("request.item", { n: seqOf.get(e.entityId) ?? "" })} · ${tk(`status.request_item.${e.to}`)}`,
        tone: e.to === "needs_info" ? ("warn" as const) : e.to === "offered" ? ("brand" as const) : ("default" as const),
      })),
    ...comments.map((c) => ({ at: c.created_at, label: tk("timeline.comment"), sub: c.body_ko })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const brandTurn = items.filter((i) => i.owner_role === "BRAND" && i.due_at).sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0];
  const h = (["needs_info", "offered", "sourcing", "received"] as const).find((s) => s === request.status);
  const handoffOwner = h === "needs_info" || h === "offered" ? "BRAND" : h === "received" ? "ADMIN" : "CN";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <Link href={`/b/${slug}/requests`} className="text-[12px] text-muted">{tk("common.back")}</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-ink pb-3">
          <h1 className="text-[26px] font-bold tracking-tight">{request.title}</h1>
          <StatusPill entity="request" status={request.status} />
          {request.created_via === "admin_proxy" && <span className="text-[11px] text-muted">{tk("request.proxyBadge")}</span>}
        </div>
        {request.memo && <p className="mt-3 whitespace-pre-wrap text-[14px] text-ink-2">{request.memo}</p>}

        {h && (
          <div className="mt-6">
            <HandoffCard
              owner={handoffOwner}
              due={handoffOwner === "BRAND" ? (brandTurn?.due_at ?? null) : null}
              title={tk(`handoff.${h}.title`)}
              decide={tk(`handoff.${h}.decide`)}
              cta={h === "offered" ? { href: `/b/${slug}/offers`, label: tk("handoff.offered.cta") } : undefined}
            />
          </div>
        )}

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-wide text-muted">{tk("request.detail.items")}</h2>
        <ol className="mt-2 divide-y divide-line border-t border-line">
          {items.map((it) => {
            const imgs = images.filter((i) => i.request_item_id === it.id);
            const next = allowedNext("request_item", it.status, user.role);
            const reason = comments.filter((c) => c.target_id === it.id).at(-1);
            return (
              <li key={it.id} className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="num text-[22px] font-semibold leading-none">{String(it.seq).padStart(2, "0")}</span>
                    <div>
                      <p className="text-[15px] font-medium">{it.description}</p>
                      <p className="num mt-0.5 text-[12px] text-muted">
                        {[it.category, it.expected_qty_range, it.target_price_krw ? `₩${krw(it.target_price_krw)}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <StatusPill entity="request_item" status={it.status} />
                </div>
                {imgs.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {imgs.map((img) =>
                      img.storage_path ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                        <img key={img.id} src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
                      ) : (
                        <a key={img.id} href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="col-span-2 flex aspect-[3/2] items-center break-all bg-surface p-2 text-[11px] text-ink-2 underline">
                          {img.source_url}
                        </a>
                      ),
                    )}
                  </div>
                )}
                {it.expected_offer_date && (it.status === "assigned" || it.status === "sourcing") && (
                  <p className="num mt-2 text-[12px] text-ink-2">{tk("request.detail.expectedOffer", { date: fmtDate(it.expected_offer_date) })}</p>
                )}
                {it.status === "needs_info" && reason && <p className="mt-3 border-l-2 border-warn pl-3 text-[13px]">{reason.body_ko}</p>}
                <div className="mt-3">
                  <ItemActions brandId={brand.id} itemId={it.id} canCancel={next.includes("cancelled")} canSupply={it.status === "needs_info" && next.includes("received")} />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <aside>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{tk("request.detail.timeline")}</h2>
        <div className="mt-4">
          <Timeline rows={rows} />
        </div>
      </aside>
    </div>
  );
}
