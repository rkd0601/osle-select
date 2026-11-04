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
import { StatusDot } from "@/components/domain/status-pill";
import { IndexRow, Rows } from "@/components/domain/index-row";
import { Figure } from "@/components/domain/figure";
import { bundleTitle } from "./_ui/list";

/**
 * B-01 브랜드 홈 (디자인 v2 §5). 왼쪽: 눈썹(브랜드 · 날짜) → "지금 결정할 일 n"(40/300, n 금색) + "상품 요청" → 내 차례 블록(기한 순)
 * → "진행 중 n" 인덱스 행(최근 8). 오른쪽: 청구 예정(ink 룰) · 새 제안 · 진행 중 요청 항목. 통계 타일·인사말 없음, 같은 숫자를 두 번 보이지 않는다.
 * 카드는 lib/handoff 템플릿(브랜드 차례만). 데이터는 전부 브랜드 뷰(규칙 1).
 */
type Card = { key: string; due: string | null; title: string; decide: string; cta: { href: string; label: string } };

export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const supabase = await createClient();
  const [requests, samples, orders, { data: newOffers }] = await Promise.all([
    listBrandRequests(brand.id), listBrandSamples(brand.id), listBrandOrders(brand.id),
    supabase.from("v_offers_brand").select("id, exclusive_until").eq("brand_id", brand.id).eq("status", "new"),
  ]);
  const base = `/b/${slug}`;
  const sampleTitle = (s: (typeof samples)[number]) => bundleTitle(s, s.qty, tk("sample.detail.title", { date: fmtDate(s.created_at) }));
  const orderTitle = (o: (typeof orders)[number]) => bundleTitle(o, o.qty, tk("order.detail.title", { date: fmtDate(o.created_at) }));
  const cards: Card[] = [];

  // 제안: 반응 전(new) 제안이 있으면 블록 1개 (건수는 오른쪽 "새 제안"에만 — 같은 숫자 두 번 금지)
  if (newOffers?.length) {
    const h = handoffFor("request", "offered")!;
    const due = (newOffers.map((o) => o.exclusive_until as string | null).filter(Boolean) as string[]).sort()[0] ?? null;
    cards.push({ key: "offers", due: due ? `${due}T23:59:59+09:00` : null, title: tk(h.title), decide: tk(h.decide), cta: { href: `${base}/offers`, label: tk(h.ctaLabel!) } });
  }
  // 요청: 보완 요청(브랜드 차례)
  for (const r of requests) {
    if (r.status !== "needs_info") continue;
    const h = handoffFor("request", "needs_info")!;
    cards.push({ key: `req-${r.id}`, due: r.brandDue, title: tk(h.title), decide: r.title ?? tk("request.untitled"), cta: { href: `${base}/requests/${r.id}`, label: tk("home.open") } });
  }
  // 샘플: 입금 · 피드백 · 회수
  for (const s of samples) {
    if (!["awaiting_payment", "delivered", "feedback_done"].includes(s.status)) continue;
    if (s.status === "awaiting_payment" && s.payment_reported_at) continue; // 신고 뒤엔 위아더 차례
    const h = handoffFor("sample_request", s.status)!;
    const due = s.status === "delivered" ? s.feedback_due : s.status === "feedback_done" ? s.return_due : s.due_at;
    const title = s.status === "awaiting_payment" ? tk("home.turn.samplePay", { n: krw(s.logistics_fee_krw) }) : s.status === "feedback_done" ? tk("home.turn.sampleReturn", { n: s.qty }) : tk(h.title);
    cards.push({ key: `smp-${s.id}`, due, title, decide: sampleTitle(s), cta: { href: `${base}/samples/${s.id}`, label: tk(h.ctaLabel!) } });
  }
  // 발주: 선금 · 수량 확정 · 최종 견적 동의 · 받기 · 검수 보고
  for (const o of orders) {
    if (!["deposit_pending", "quoted", "final_quoted", "sent_to_brand", "delivered"].includes(o.status)) continue;
    if (o.status === "deposit_pending" && o.deposit_reported_at) continue;
    if (o.status === "final_quoted" && o.owner_role !== "BRAND") continue; // 최종 견적에 동의했으면 위아더 차례 (u-10)
    const h = handoffFor("order", o.status)!;
    const title = o.status === "deposit_pending" && o.deposit_krw != null ? tk("home.turn.deposit", { n: krw(o.deposit_krw) }) : tk(h.title);
    cards.push({ key: `ord-${o.id}`, due: o.due_at, title, decide: orderTitle(o), cta: { href: `${base}/orders/${o.id}`, label: tk(h.ctaLabel!) } });
  }
  cards.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));

  // 진행 중(위아더·중국 차례): 종료·취소 제외, 내 차례 블록으로 이미 보인 건 제외
  const mine = new Set(cards.map((c) => c.key));
  const who = (role: string | null | undefined, at: string | null | undefined) =>
    role === "ADMIN" || role === "CN" ? `${tk(`home.owner.${role}`)}${at ? ` ${fmtDate(at)}` : ""}` : at ? fmtDate(at) : "";
  const inProgressAll = [
    ...requests.filter((r) => !["closed", "cancelled", "needs_info"].includes(r.status)).map((r) => ({
      key: `req-${r.id}`, entity: "request" as const, status: r.status, title: r.title ?? tk("request.untitled"), href: `${base}/requests/${r.id}`, at: r.created_at,
      meta: `${tk("nav.requests")} · ${tk("home.items", { n: r.itemCount })}`, due: "",
    })),
    ...samples.filter((s) => !["closed", "cancelled"].includes(s.status)).map((s) => ({
      key: `smp-${s.id}`, entity: "sample_request" as const, status: s.status, title: sampleTitle(s), href: `${base}/samples/${s.id}`, at: s.created_at,
      meta: `${tk("nav.samples")} · ${fmtDate(s.created_at)}`, due: who(s.owner_role, s.due_at),
    })),
    ...orders.filter((o) => !["report_done", "cancelled"].includes(o.status)).map((o) => ({
      key: `ord-${o.id}`, entity: "order" as const, status: o.status, title: orderTitle(o), href: `${base}/orders/${o.id}`, at: o.created_at,
      meta: `${tk("nav.orders")} · ${fmtDate(o.created_at)}${o.total != null ? ` · ₩${krw(o.total)}` : ""}`, due: who(o.owner_role, o.due_at),
    })),
  ].filter((x) => !mine.has(x.key)).sort((a, b) => b.at.localeCompare(a.at));
  const inProgress = inProgressAll.slice(0, 8);

  // 청구 예정: 미회수 샘플 상품가(발주 때 차감) + 입금 전 샘플비 + 확정된 발주 청구 합계(미완료 건)
  const sampleCharges = samples.reduce((s, x) => s + x.charged, 0);
  const sampleFees = samples.filter((x) => x.status !== "cancelled" && x.payment_required && !x.payment_confirmed_at).reduce((s, x) => s + (x.logistics_fee_krw ?? 0), 0);
  const orderTotals = orders.filter((o) => ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);
  const billing = sampleCharges + sampleFees + orderTotals;
  // 내역은 두 줄까지, 항목이 하나뿐이면 합계와 같은 숫자라 내역을 내지 않는다
  const parts = ([[tk("home.billing.orders"), orderTotals], [tk("home.billing.sampleFees"), sampleFees], [tk("home.billing.sampleCharges"), sampleCharges]] as [string, number][]).filter(([, v]) => v > 0);
  const billRows: [string, string][] = parts.length === 3
    ? [[parts[0][0], `₩${krw(parts[0][1])}`], [tk("home.billing.samples"), `₩${krw(sampleFees + sampleCharges)}`]]
    : parts.length === 2 ? parts.map(([k, v]) => [k, `₩${krw(v)}`]) : [];

  const openItems = requests.reduce((s, r) => s + (["closed", "cancelled"].includes(r.status) ? 0 : r.itemCount), 0);
  const offersN = newOffers?.length ?? 0;
  const requestBtn = <Link href={`${base}/requests/new`} className="btn max-sm:hidden">{tk("home.request")}</Link>;

  return (
    <div className="two">
      <div className="stack">
        <div>
          <div className="phead">
            <div className="min-w-0">
              <div className="eyebrow">{brand.name} · {fmtDate(new Date())}</div>
              {cards.length ? (
                <h1 className="display mt-3" style={{ fontWeight: 300 }}>{tk("home.decide")} <span className="num text-gold">{cards.length}</span></h1>
              ) : (
                <h1 className="h1 mt-3 text-ink-2" style={{ fontWeight: 400 }}>{tk("home.decideNone")}</h1>
              )}
            </div>
            {requestBtn}
          </div>
          {cards.length > 0 && (
            <div className="[&>.handoff:first-child]:border-t-0">
              {cards.map((c) => <HandoffCard key={c.key} owner="BRAND" due={c.due} title={c.title} decide={c.decide} cta={c.cta} />)}
            </div>
          )}
        </div>

        {inProgress.length > 0 && (
          <section>
            <div className="section-h"><h2>{tk("home.inProgress")}<span className="count">{inProgressAll.length}</span></h2></div>
            <Rows>
              {inProgress.map((x) => (
                <IndexRow key={x.key} href={x.href} title={x.title} meta={x.meta} status={<StatusDot entity={x.entity} status={x.status} />} due={x.due} />
              ))}
            </Rows>
          </section>
        )}
      </div>

      <aside className="stack" style={{ gap: 40 }}>
        <Figure first label={tk("home.billing")} currency="₩" value={krw(billing)} dim={billing === 0} rows={billRows} help={tk("home.billingHelp")} />
        <Figure label={tk("home.stat.newOffers")} value={offersN} dim={offersN === 0}
          help={offersN ? <Link href={`${base}/offers`} className="link">{tk("home.toOffers")}</Link> : tk("home.newOffersNone")} />
        <Figure label={tk("home.openItems")} value={openItems} dim={openItems === 0} help={<Link href={`${base}/requests`} className="link">{tk("home.toRequests")}</Link>} />
        <Link href={`${base}/requests/new`} className="btn lg w-full sm:hidden">{tk("home.request")}</Link>
      </aside>
    </div>
  );
}
