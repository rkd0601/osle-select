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

/**
 * B-01 브랜드 홈 (PRD 8장: "지금 당신 차례" 핸드오프 카드 모음 · 청구 예정 · 진행 중). 2026-11-04 UX 검증에서 2단계 골격을 완성.
 * 카드는 lib/handoff 템플릿(브랜드 차례만 모아 기한 순), 나머지 진행 중 건은 상태 pill 한 줄씩. 데이터는 전부 브랜드 뷰(규칙 1).
 */
type Card = { key: string; owner: "BRAND"; due: string | null; title: string; decide: string; cta: { href: string; label: string } };

export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
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
  const inProgress = [
    ...requests.filter((r) => !["closed", "cancelled", "needs_info"].includes(r.status)).map((r) => ({ key: `req-${r.id}`, entity: "request" as const, status: r.status, label: r.title ?? tk("request.untitled"), href: `${base}/requests/${r.id}`, at: r.created_at })),
    ...samples.filter((s) => !["closed", "cancelled"].includes(s.status)).map((s) => ({ key: `smp-${s.id}`, entity: "sample_request" as const, status: s.status, label: tk("sample.detail.title", { date: fmtDate(s.created_at) }), href: `${base}/samples/${s.id}`, at: s.created_at })),
    ...orders.filter((o) => !["report_done", "cancelled"].includes(o.status)).map((o) => ({ key: `ord-${o.id}`, entity: "order" as const, status: o.status, label: tk("order.detail.title", { date: fmtDate(o.created_at) }), href: `${base}/orders/${o.id}`, at: o.created_at })),
  ].filter((x) => !mine.has(x.key)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  // 청구 예정: 미회수 샘플 상품가(발주 때 차감) + 확정된 발주 청구 합계(미완료 건)
  const sampleCharges = samples.reduce((s, x) => s + x.charged, 0);
  const sampleFees = samples.filter((x) => !["cancelled"].includes(x.status) && x.payment_required && !x.payment_confirmed_at).reduce((s, x) => s + (x.logistics_fee_krw ?? 0), 0);
  const orderTotals = orders.filter((o) => ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);
  const billing = sampleCharges + sampleFees + orderTotals;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section className="space-y-6">
        <div>
          <h1 className="text-h1-s font-bold tracking-tight">{tk("home.yourTurn")} {cards.length > 0 && <span className="num text-signature">{cards.length}</span>}</h1>
          <div className="mt-4 space-y-3">
            {cards.length ? cards.map((c) => <HandoffCard key={c.key} owner={c.owner} due={c.due} title={c.title} decide={c.decide} cta={c.cta} />)
              : <div className="rounded-ui border border-line bg-surface p-5 text-lead text-ink-2">{inProgress.length ? tk("home.nothingToDecide") : tk("home.empty")}</div>}
          </div>
        </div>
        {inProgress.length > 0 && (
          <div>
            <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("home.inProgress")}</h2>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {inProgress.map((x) => (
                <li key={x.key}>
                  <Link href={x.href} className="flex items-center justify-between gap-3 py-2.5 text-body hover:bg-surface">
                    <span className="truncate">{x.label}</span>
                    <StatusPill entity={x.entity} status={x.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <aside className="space-y-4">
        <Link href={`${base}/requests/new`} className="block rounded-ui bg-ink px-4 py-3 text-center text-lead font-medium text-paper">{tk("home.request")}</Link>
        <div className="rounded-ui border border-line bg-surface p-4 text-body">
          <div className="text-ink-2">{tk("home.billing")}</div>
          <div className="num mt-1 text-h1-s font-semibold">₩{krw(billing)}</div>
          <dl className="num mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-caption text-ink-2">
            {orderTotals > 0 && <><dt>{tk("home.billing.orders")}</dt><dd>₩{krw(orderTotals)}</dd></>}
            {sampleFees > 0 && <><dt>{tk("home.billing.sampleFees")}</dt><dd>₩{krw(sampleFees)}</dd></>}
            {sampleCharges > 0 && <><dt>{tk("home.billing.sampleCharges")}</dt><dd>₩{krw(sampleCharges)}</dd></>}
          </dl>
          <p className="mt-2 text-caption text-muted">{tk("home.billingHelp")}</p>
        </div>
        <div className="rounded-ui border border-line bg-surface p-4 text-body">
          <div className="text-ink-2">{tk("home.openItems")}</div>
          <div className="num mt-1 text-h1-s font-semibold">{requests.reduce((s, r) => s + (["closed", "cancelled"].includes(r.status) ? 0 : r.itemCount), 0)}</div>
        </div>
      </aside>
    </div>
  );
}
