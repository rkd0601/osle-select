import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { tk } from "@/lib/i18n";
import { fmtDate, krw } from "@/lib/format";
import { listBrandRequests } from "@/lib/db/brand/requests";
import { listBrandSamples } from "@/lib/db/brand/samples";
import { listBrandOrders } from "@/lib/db/brand/orders";
import { createClient } from "@/lib/supabase/server";
import { handoffFor } from "@/lib/handoff";
import { HandoffCard } from "@/components/domain/handoff-card";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { StatGrid } from "@/components/domain/stat";
import { EmptyState } from "@/components/domain/empty-state";

/**
 * B-01 브랜드 홈 (PRD 8장: "지금 당신 차례" 핸드오프 카드 모음 · 청구 예정 · 진행 중). 2026-11-04 UX 검증에서 2단계 골격을 완성.
 * 카드는 lib/handoff 템플릿(브랜드 차례만 모아 기한 순), 나머지 진행 중 건은 상태 pill 한 줄씩. 데이터는 전부 브랜드 뷰(규칙 1).
 */
type Card = { key: string; owner: "BRAND"; due: string | null; title: string; decide: string; cta: { href: string; label: string } };

export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, brand } = await requireBrandMember(slug);
  const supabase = await createClient();
  const [requests, samples, orders, { data: newOffers }] = await Promise.all([
    listBrandRequests(brand.id), listBrandSamples(brand.id), listBrandOrders(brand.id),
    supabase.from("v_offers_brand").select("id, exclusive_until").eq("brand_id", brand.id).eq("status", "new"),
  ]);
  const base = `/b/${slug}`;
  const cards: Card[] = [];

  // 제안: 반응 전(new) 제안이 있으면 카드 1장
  if (newOffers?.length) {
    const h = handoffFor("request", "offered")!;
    const due = (newOffers.map((o) => o.exclusive_until as string | null).filter(Boolean) as string[]).sort()[0] ?? null;
    cards.push({ key: "offers", owner: "BRAND", due: due ? `${due}T23:59:59+09:00` : null, title: tk("home.newOffers", { n: newOffers.length }), decide: tk(h.decide), cta: { href: `${base}/offers`, label: tk(h.ctaLabel!) } });
  }
  // 요청: 보완 요청(브랜드 차례)
  for (const r of requests) {
    if (r.status !== "needs_info") continue;
    const h = handoffFor("request", "needs_info")!;
    cards.push({ key: `req-${r.id}`, owner: "BRAND", due: r.brandDue, title: `${r.title ?? tk("request.untitled")} — ${tk(h.title)}`, decide: tk(h.decide), cta: { href: `${base}/requests/${r.id}`, label: tk("home.open") } });
  }
  // 샘플: 입금 · 피드백 · 회수
  for (const s of samples) {
    if (!["awaiting_payment", "delivered", "feedback_done"].includes(s.status)) continue;
    if (s.status === "awaiting_payment" && s.payment_reported_at) continue; // 신고 뒤엔 위아더 차례
    const h = handoffFor("sample_request", s.status)!;
    const due = s.status === "delivered" ? s.feedback_due : s.status === "feedback_done" ? s.return_due : s.due_at;
    cards.push({ key: `smp-${s.id}`, owner: "BRAND", due, title: `${tk("sample.detail.title", { date: fmtDate(s.created_at) })} — ${tk(h.title)}`, decide: tk(h.decide), cta: { href: `${base}/samples/${s.id}`, label: tk(h.ctaLabel!) } });
  }
  // 발주: 선금 · 수량 확정 · 최종 견적 동의 · 받기 · 검수 보고
  for (const o of orders) {
    if (!["deposit_pending", "quoted", "final_quoted", "sent_to_brand", "delivered"].includes(o.status)) continue;
    if (o.status === "deposit_pending" && o.deposit_reported_at) continue;
    if (o.status === "final_quoted" && o.owner_role !== "BRAND") continue; // 최종 견적에 동의했으면 위아더 차례 (u-10)
    const h = handoffFor("order", o.status)!;
    cards.push({ key: `ord-${o.id}`, owner: "BRAND", due: o.due_at, title: `${tk("order.detail.title", { date: fmtDate(o.created_at) })} — ${tk(h.title)}`, decide: tk(h.decide), cta: { href: `${base}/orders/${o.id}`, label: tk(h.ctaLabel!) } });
  }
  cards.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));

  // 진행 중(위아더·중국 차례): 종료·취소 제외, 내 차례 카드로 이미 보인 건 제외
  const mine = new Set(cards.map((c) => c.key));
  const inProgressFull = [
    ...requests.filter((r) => !["closed", "cancelled", "needs_info"].includes(r.status)).map((r) => ({ key: `req-${r.id}`, entity: "request" as const, status: r.status, label: r.title ?? tk("request.untitled"), href: `${base}/requests/${r.id}`, at: r.created_at })),
    ...samples.filter((s) => !["closed", "cancelled"].includes(s.status)).map((s) => ({ key: `smp-${s.id}`, entity: "sample_request" as const, status: s.status, label: tk("sample.detail.title", { date: fmtDate(s.created_at) }), href: `${base}/samples/${s.id}`, at: s.created_at })),
    ...orders.filter((o) => !["report_done", "cancelled"].includes(o.status)).map((o) => ({ key: `ord-${o.id}`, entity: "order" as const, status: o.status, label: tk("order.detail.title", { date: fmtDate(o.created_at) }), href: `${base}/orders/${o.id}`, at: o.created_at })),
  ].filter((x) => !mine.has(x.key)).sort((a, b) => b.at.localeCompare(a.at));
  const inProgressAll = inProgressFull;
  const inProgress = inProgressFull.slice(0, 8);

  // 청구 예정: 미회수 샘플 상품가(발주 때 차감) + 확정된 발주 청구 합계(미완료 건)
  const sampleCharges = samples.reduce((s, x) => s + x.charged, 0);
  const sampleFees = samples.filter((x) => !["cancelled"].includes(x.status) && x.payment_required && !x.payment_confirmed_at).reduce((s, x) => s + (x.logistics_fee_krw ?? 0), 0);
  const orderTotals = orders.filter((o) => ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);
  const billing = sampleCharges + sampleFees + orderTotals;

  const name = user.displayName ?? user.email ?? "";
  const openItems = requests.reduce((s, r) => s + (["closed", "cancelled"].includes(r.status) ? 0 : r.itemCount), 0);
  const ENTITY = { request: tk("nav.requests"), sample_request: tk("nav.samples"), order: tk("nav.orders") } as const;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`${brand.name} · ${fmtDate(new Date())}`}
        title={name ? tk("home.greeting", { name }) : tk("nav.home")}
        description={cards.length ? tk("home.greetingTurn", { n: cards.length }) : tk("home.greetingCalm")}
        actions={<Link href={`${base}/requests/new`} className="btn btn-primary btn-lg">{tk("home.request")}</Link>}
      />

      <StatGrid
        items={[
          { label: tk("home.stat.turn"), value: cards.length, tone: cards.length ? "brand" : "default", hint: tk("home.stat.turnHint"), href: "#turn" },
          { label: tk("home.stat.newOffers"), value: newOffers?.length ?? 0, tone: newOffers?.length ? "brand" : "default", hint: tk("home.stat.newOffersHint"), href: `${base}/offers?tab=new` },
          { label: tk("home.stat.active"), value: inProgressAll.length, hint: tk("home.stat.activeHint", { n: openItems }), href: inProgress.length ? "#progress" : undefined },
          { label: tk("home.billing"), value: `₩${krw(billing)}`, hint: tk("home.stat.billingHint"), href: "#billing" },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <section id="turn" className="scroll-mt-28">
            <div className="flex items-baseline justify-between border-b border-ink pb-2">
              <h2 className="text-h3 font-bold tracking-tight">
                {tk("home.yourTurn")} {cards.length > 0 && <span className="num ml-1 text-signature">{cards.length}</span>}
              </h2>
              {cards.length > 0 && <span className="text-caption text-ink-2">{tk("home.sortedByDue")}</span>}
            </div>
            <div className="mt-4 space-y-3">
              {cards.length ? cards.map((c) => <HandoffCard key={c.key} owner={c.owner} due={c.due} title={c.title} decide={c.decide} cta={c.cta} />)
                : <EmptyState compact title={inProgress.length ? tk("home.nothingToDecide") : tk("home.empty")} action={inProgress.length ? undefined : { href: `${base}/requests/new`, label: tk("home.request") }} />}
            </div>
          </section>

          {inProgress.length > 0 && (
            <section id="progress" className="scroll-mt-28">
              <div className="flex items-baseline justify-between border-b border-ink pb-2">
                <h2 className="text-h3 font-bold tracking-tight">{tk("home.inProgress")} <span className="num ml-1 text-ink-2">{inProgressAll.length}</span></h2>
                <span className="text-caption text-ink-2">{tk("home.inProgressHelp")}</span>
              </div>
              <ul className="card mt-4 divide-y divide-line overflow-hidden">
                {inProgress.map((x) => (
                  <li key={x.key}>
                    <Link href={x.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-paper sm:grid-cols-[64px_minmax(0,1fr)_auto]">
                      <span className="eyebrow hidden sm:block">{ENTITY[x.entity]}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-ink group-hover:underline group-hover:underline-offset-4">{x.label}</span>
                        <span className="num block text-caption text-muted"><span className="sm:hidden">{ENTITY[x.entity]} · </span>{fmtDate(x.at)}</span>
                      </span>
                      <StatusPill entity={x.entity} status={x.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section id="billing" className="card card-pad scroll-mt-28">
            <div className="eyebrow">{tk("home.billing")}</div>
            <div className="num mt-2 text-title font-semibold leading-none tracking-tight">₩{krw(billing)}</div>
            {billing > 0 && (
              <dl className="num mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-3 text-meta text-ink-2">
                {orderTotals > 0 && <><dt>{tk("home.billing.orders")}</dt><dd className="text-ink">₩{krw(orderTotals)}</dd></>}
                {sampleFees > 0 && <><dt>{tk("home.billing.sampleFees")}</dt><dd className="text-ink">₩{krw(sampleFees)}</dd></>}
                {sampleCharges > 0 && <><dt>{tk("home.billing.sampleCharges")}</dt><dd className="text-ink">₩{krw(sampleCharges)}</dd></>}
              </dl>
            )}
            <p className="mt-3 text-caption text-muted">{tk("home.billingHelp")}</p>
          </section>
          <section className="card card-pad">
            <div className="eyebrow">{tk("home.openItems")}</div>
            <div className="num mt-2 text-title font-semibold leading-none">{openItems}</div>
            <Link href={`${base}/requests`} className="mt-3 inline-block text-meta font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">{tk("home.toRequests")}</Link>
          </section>
          <nav aria-label={tk("home.quick")} className="card divide-y divide-line overflow-hidden">
            {([["offers", tk("nav.offers")], ["samples", tk("nav.samples")], ["orders", tk("nav.orders")], ["exports", tk("nav.exports")]] as const).map(([p, label]) => (
              <Link key={p} href={`${base}/${p}`} className="flex items-center justify-between px-4 py-3 text-body text-ink hover:bg-paper">
                {label}<span aria-hidden className="text-muted">→</span>
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
