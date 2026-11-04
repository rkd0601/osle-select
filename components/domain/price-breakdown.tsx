import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { supplyPriceKrw, type PriceTier } from "@/lib/pricing";

/**
 * 금액 내역표 (공통 컴포넌트 5/8). 메인 숫자는 공급가(수수료 포함) 하나, 펼치면 상품가 / 소싱 서비스 수수료.
 * 입력은 offer에 고정된 price_tiers·fee_rate뿐 — 원가·환율·녹인 마진은 여기 올 수 없다 (CLAUDE.md 절대 규칙 1·5).
 */
export function PriceBreakdown({ tiers, feeRate, compact }: { tiers: PriceTier[]; feeRate: number; compact?: boolean }) {
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  const base = sorted[0];
  if (!base) return null;
  const supply = supplyPriceKrw(base.product_price_krw, feeRate);
  if (compact) {
    return (
      <div>
        <div className="num text-h2 font-semibold leading-none tracking-tight">₩{krw(supply)}</div>
        <div className="num mt-1 text-caption text-muted">{tk("price.compact", { product: krw(base.product_price_krw), fee: Math.round(feeRate * 100), qty: base.min_qty })}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta font-medium text-ink-2">{tk("price.supply")}</span>
        <span className="num text-title-l font-semibold leading-none tracking-tight">₩{krw(supply)}</span>
      </div>
      <table className="mt-3 w-full text-meta">
        <thead className="border-b border-ink text-left text-caption text-muted">
          <tr><th className="py-1 font-normal">{tk("price.qty")}</th><th className="text-right font-normal">{tk("price.product")}</th><th className="text-right font-normal">{tk("price.fee", { n: Math.round(feeRate * 100) })}</th><th className="text-right font-normal">{tk("price.supply")}</th></tr>
        </thead>
        <tbody className="num">
          {sorted.map((t) => {
            const s = supplyPriceKrw(t.product_price_krw, feeRate);
            return (
              <tr key={t.min_qty} className="border-t border-line first:border-t-0">
                <td className="py-1.5">{tk("price.qtyFrom", { n: t.min_qty })}</td>
                <td className="text-right">₩{krw(t.product_price_krw)}</td>
                <td className="text-right text-ink-2">₩{krw(s - t.product_price_krw)}</td>
                <td className="text-right font-semibold">₩{krw(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-muted">{tk("price.feeIncludes")}</p>
      <p className="text-caption text-muted">{tk("price.logisticsSeparate")}</p>
    </div>
  );
}
