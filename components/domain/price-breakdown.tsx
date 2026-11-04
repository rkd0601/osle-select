import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { supplyPriceKrw, type PriceTier } from "@/lib/pricing";

/**
 * 금액 내역표 (공통 컴포넌트). 메인 숫자는 공급가(수수료 포함) 하나 — 디자인 v2: 40/300, 아래 `.tbl` 구간표(상품가 / 소싱 서비스 수수료 / 공급가).
 * compact = 라인시트 카드용 한 줄(`.price` 20/400 + "수수료 포함 · n장~", 구간 12 muted).
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
        <div className="price">
          <span className="main">₩{krw(supply)}</span>
          <span className="sub">{tk("linesheet.priceSub", { qty: base.min_qty })}</span>
        </div>
        {sorted.length > 1 && (
          <div className="price-tiers">
            {sorted.slice(1).map((t) => <span key={t.min_qty}>{tk("linesheet.tier", { qty: t.min_qty, n: krw(supplyPriceKrw(t.product_price_krw, feeRate)) })}</span>)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="label">{tk("price.supply")}</div>
      <div className="num mt-2.5 text-display font-light leading-none tracking-[-0.03em]">
        <span className="mr-1 align-[12px] text-[0.5em] font-normal text-ink-2">₩</span>{krw(supply)}
      </div>
      <p className="mt-2 text-caption text-muted">{tk("linesheet.priceSub", { qty: base.min_qty })}</p>
      <table className="tbl mt-5">
        <thead>
          <tr><th>{tk("price.qty")}</th><th className="r">{tk("price.product")}</th><th className="r">{tk("price.fee", { n: Math.round(feeRate * 100) })}</th><th className="r">{tk("price.supply")}</th></tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const s = supplyPriceKrw(t.product_price_krw, feeRate);
            return (
              <tr key={t.min_qty}>
                <td className="num">{tk("price.qtyFrom", { n: t.min_qty })}</td>
                <td className="r">₩{krw(t.product_price_krw)}</td>
                <td className="r text-ink-2">₩{krw(s - t.product_price_krw)}</td>
                <td className="r strong">₩{krw(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-muted">{tk("price.feeIncludes")}</p>
      <p className="mt-1 text-caption text-muted">{tk("price.logisticsSeparate")}</p>
    </div>
  );
}
