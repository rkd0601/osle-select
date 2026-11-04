import Link from "next/link";
import { tk } from "@/lib/i18n";
import { MATERIALS, label } from "@/lib/codes";
import { PriceBreakdown } from "./price-breakdown";
import { Photo } from "./photo";
import type { PriceTier } from "@/lib/pricing";

/**
 * 라인시트 카드 `.item` (디자인 v2 §4). 사진 3:4(코드 태그 왼쪽 아래 · "실물 확인" 왼쪽 위) → 코드 12 → 이름 16/500
 * → 스펙(색상 점 · 사이즈 · 소재 13) → 가격(수수료 포함 20/400 + "수수료 포함 · n장~") → 구간 12 muted → 반응(children).
 * 도매몰식 그리드가 아니라 요청 항목별 묶음 안의 카드다. 상자·그림자 없음. tone은 상태 점 색(선택).
 */
const TONE = { default: "", brand: "", warn: "warn", new: "" } as const;

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
  tone?: keyof typeof TONE;
  children?: React.ReactNode;
}) {
  const shownColors = props.colors.slice(0, 6);
  const moreColors = props.colors.length - shownColors.length;
  const fabric = props.fabric.map((f) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(" · ");
  const badge = props.dday !== null ? tk("linesheet.dday", { n: props.dday }) : props.recommend ? tk("linesheet.recommend") : null;
  return (
    <article className="item min-w-0">
      <Link href={props.href} className="block">
        <Photo src={props.image} label={props.code} alt={props.name ?? ""} verified={props.verified ? tk("linesheet.verified") : null}>
          {badge && <span className="num absolute right-3 top-3 bg-paper/90 px-2 py-[3px] text-[11px] tracking-[.04em] text-ink">{badge}</span>}
        </Photo>
      </Link>
      <div className="info">
        <div className="flex items-baseline justify-between gap-2">
          <span className="code truncate">{props.code}</span>
          {props.statusLabel && <span className={`st shrink-0 ${TONE[props.tone ?? "default"]}`}>{props.statusLabel}</span>}
        </div>
        <h3 className="name"><Link href={props.href} className="hover:underline hover:underline-offset-4">{props.name}</Link></h3>
        {(props.colors.length > 0 || props.sizes.length > 0 || fabric) && (
          <div className="spec">
            {props.colors.length > 0 && (
              <span className="swatch" role="img" aria-label={props.colors.map((c) => c.name_ko).filter(Boolean).join(", ")}>
                {shownColors.map((c, i) => <i key={i} title={c.name_ko ?? ""} style={{ background: c.hex ?? "transparent" }} />)}
                {moreColors > 0 && <span className="num text-caption text-muted">+{moreColors}</span>}
              </span>
            )}
            {props.sizes.length > 0 && <span className="num">{props.sizes.join(" · ")}</span>}
            {fabric && <span>{fabric}</span>}
          </div>
        )}
        <PriceBreakdown tiers={props.tiers} feeRate={props.feeRate} compact />
        {props.children}
      </div>
    </article>
  );
}
