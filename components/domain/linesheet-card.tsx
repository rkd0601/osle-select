import Link from "next/link";
import { tk } from "@/lib/i18n";
import { MATERIALS, label } from "@/lib/codes";
import { PriceBreakdown } from "./price-breakdown";
import type { PriceTier } from "@/lib/pricing";

/**
 * 라인시트 카드 (공통 컴포넌트 6/8). 지금 엑셀 라인시트의 항목 그대로, 더 크게: 3:4 실물컷 · 코드 · 컬러칩 · 사이즈 · 공급가 · 혼용률.
 * 신뢰 신호: 실물 확인 배지, 추천 표시, 독점 D-day. 도매몰식 그리드가 아니라 요청 항목별 묶음 안의 카드다.
 */
export function LinesheetCard(props: {
  href: string;
  image: string | null;
  code: string | null;
  name: string | null;
  colors: { name_ko: string | null; hex: string | null }[];
  sizes: string[];
  fabric: { material_code: string; pct: number }[];
  tiers: PriceTier[];
  feeRate: number;
  verified: boolean;
  recommend: boolean;
  dday: number | null;
  statusLabel?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col">
      <Link href={props.href} className="group relative block">
        {props.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
          <img src={props.image} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
        ) : <span className="block aspect-[3/4] w-full bg-sand" />}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1 text-micro font-semibold">
          {props.verified && <span className="bg-paper/90 px-1.5 py-0.5 text-signature">{tk("linesheet.verified")}</span>}
          {props.recommend && <span className="bg-paper/90 px-1.5 py-0.5 text-ink-2">{tk("linesheet.recommend")}</span>}
        </div>
        {props.dday !== null && <span className="num absolute right-2 top-2 bg-ink px-1.5 py-0.5 text-micro text-paper">{tk("linesheet.dday", { n: props.dday })}</span>}
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="num text-caption tracking-wide text-muted">{props.code}</span>
        {props.statusLabel && <span className="text-caption text-ink-2">{props.statusLabel}</span>}
      </div>
      <h3 className="text-lead font-medium leading-snug">{props.name}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {props.colors.map((c, i) => (
          <span key={i} title={c.name_ko ?? ""} className="inline-flex items-center gap-1 text-caption text-ink-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-line" style={{ background: c.hex ?? "transparent" }} />
            {c.name_ko}
          </span>
        ))}
      </div>
      <p className="num mt-1 text-caption text-muted">
        {props.sizes.join(" · ")}
        {props.fabric.length > 0 && ` · ${props.fabric.map((f) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ")}`}
      </p>
      <div className="mt-2"><PriceBreakdown tiers={props.tiers} feeRate={props.feeRate} compact /></div>
      {props.children && <div className="mt-3">{props.children}</div>}
    </article>
  );
}
