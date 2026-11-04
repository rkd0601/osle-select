import { supplyPriceKrw } from "@/lib/pricing";
import { requireBrandMember } from "@/lib/auth/session";
import { listOrderCandidates } from "@/lib/db/brand/orders";
import { signedReadUrls } from "@/lib/storage";
import { BackLink } from "../../_ui/list";
import { tk } from "@/lib/i18n";
import { OrderForm, type OrderCand } from "./order-form";
import { bySortOrder } from "@/lib/images/order";

/**
 * B-08 발주서 1단계 (예약). 관심 제안 중 담기 조건(샘플 관심 또는 리오더, 절대 규칙 7)을 충족한 것만 담을 수 있다.
 * 미충족은 이유와 함께 비활성으로 보인다. ?offers=<id,id> 로 B-07에서 들어온다.
 */
export default async function NewOrderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ offers?: string }> }) {
  const { slug } = await params;
  const { brand, member } = await requireBrandMember(slug);
  const { offers: pre } = await searchParams;
  const data = await listOrderCandidates(brand.id);
  const cover = (pid: string) => {
    // 대표 사진 = CN 편집 화면 1번(sort_order, 동순위 id) — 3차 검증 T4
    const imgs = data.images.filter((i) => i.product_id === pid).sort(bySortOrder);
    return imgs[0]?.storage_path ?? null;
  };
  const urls = await signedReadUrls("productImages", data.offers.map((o) => cover(o.product_id)).filter(Boolean) as string[]);
  const candidates: OrderCand[] = data.offers.flatMap((o) => {
    const p = data.products.find((x) => x.id === o.product_id);
    if (!p) return [];
    const img = cover(o.product_id);
    const hold = (p.hold ?? null) as { none?: true; deposit_pct?: number; days?: number } | null;
    const op = (o.option_prices ?? null) as { mods?: { item: string; moq: number; price_krw: number }[] } | null;
    // 화면 단가는 제안 카드와 같은 수수료 포함 공급가 (상품가만 보여 주면 예상 금액과 안 맞는다 — 2026-11-04 UX 2차)
    const tiers = [...((o.price_tiers ?? []) as { min_qty: number; product_price_krw: number }[])].sort((a, b) => a.min_qty - b.min_qty).map((t) => ({ ...t, supply_krw: supplyPriceKrw(t.product_price_krw, Number(o.fee_rate ?? 0)) }));
    return [{
      offerId: o.id, eligible: o.eligible, expired: o.expired, reorder: o.reorder, code: null, name: p.name_ko, image: img ? urls[img] ?? null : null,
      minQty: p.min_qty, supplyType: p.supply_type, leadDays: p.lead_days,
      depositPct: hold && !hold.none ? hold.deposit_pct ?? null : null, holdDays: hold && !hold.none ? hold.days ?? null : null,
      tiers, mods: op?.mods ?? [],
      colors: data.colors.filter((c) => c.product_id === o.product_id).map((c) => ({ id: c.id, name: c.name_ko ?? "", hex: c.hex })),
      sizes: data.sizes.filter((s) => s.product_id === o.product_id).map((s) => ({ id: s.id, label: s.label })),
      variants: data.variants.filter((v) => v.product_id === o.product_id),
    }];
  });
  const preselect = (pre ?? "").split(",").filter((id) => candidates.some((c) => c.offerId === id && c.eligible));
  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8">
        <h1 className="h1">{tk("order.new.title")}</h1>
        <p className="lead mt-2.5">{tk("order.new.lead")}</p>
      </div>
      <div className="c12 rule-ink" />
      <div className="c8 min-w-0">
        <OrderForm brandId={brand.id} slug={slug} candidates={candidates} preselect={preselect} canPurchase={member.level === "owner" || member.can_purchase} canWaive={member.onBehalf} />
      </div>
    </div>
  );
}
