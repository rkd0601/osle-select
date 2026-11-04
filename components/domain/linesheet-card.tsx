import Link from "next/link";
import { tk } from "@/lib/i18n";
import { MATERIALS, label } from "@/lib/codes";
import { PriceBreakdown } from "./price-breakdown";
import { Photo } from "./photo";
import type { PriceTier } from "@/lib/pricing";

/**
 * 라인시트 카드 (공통 컴포넌트 6/8). 지금 엑셀 라인시트의 항목 그대로, 더 크게: 3:4 실물컷 · 코드 · 컬러칩 · 사이즈 · 공급가 · 혼용률.
 * 신뢰 신호: 실물 확인 배지, 추천 표시, 독점 D-day. 도매몰식 그리드가 아니라 요청 항목별 묶음 안의 카드다.
 * 사진이 없으면 Photo 자리표시(사선 패턴 + 상품 코드). tone은 상태 배지 색(선택).
 */
const TONE = {
  default: "bg-sand text-ink-2",
  brand: "bg-signature-soft text-signature",
  warn: "bg-warn-soft text-warn",
  new: "bg-ink text-paper",
} as const;

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
  return (
    <article className="flex min-w-0 flex-col">
      <Link href={props.href} className="group relative block overflow-hidden rounded-ui">
        <Photo src={props.image} label={props.code} alt={props.name ?? ""} className="transition-transform duration-300 group-hover:scale-[1.02]" />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1 text-micro font-semibold">
          {props.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-paper/95 px-2 py-0.5 text-signature shadow-card">
              <svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2.5 6.2 2.2 2.2 4.8-4.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {tk("linesheet.verified")}
            </span>
          )}
          {props.recommend && <span className="rounded-full bg-paper/95 px-2 py-0.5 text-ink-2 shadow-card">{tk("linesheet.recommend")}</span>}
        </div>
        {props.dday !== null && <span className="num pointer-events-none absolute right-2 top-2 rounded-full bg-ink px-2 py-0.5 text-micro font-semibold text-paper">{tk("linesheet.dday", { n: props.dday })}</span>}
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="num truncate text-caption tracking-wide text-muted">{props.code}</span>
        {props.statusLabel && <span className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold ${TONE[props.tone ?? "default"]}`}>{props.statusLabel}</span>}
      </div>
      <h3 className="mt-0.5 text-lead font-semibold leading-snug">
        <Link href={props.href} className="hover:underline hover:underline-offset-4">{props.name}</Link>
      </h3>
      {props.colors.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {shownColors.map((c, i) => (
            <span key={i} title={c.name_ko ?? ""} className="inline-flex items-center gap-1 text-caption text-ink-2">
              <span className="inline-block h-3 w-3 rounded-full border border-line-strong" style={{ background: c.hex ?? "transparent" }} />
              {c.name_ko}
            </span>
          ))}
          {moreColors > 0 && <span className="num text-caption text-muted">+{moreColors}</span>}
        </div>
      )}
      {(props.sizes.length > 0 || props.fabric.length > 0) && (
        <p className="num mt-1 text-caption text-muted">
          {props.sizes.join(" · ")}
          {props.sizes.length > 0 && props.fabric.length > 0 && " — "}
          {props.fabric.map((f) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ")}
        </p>
      )}
      <div className="mt-3 border-t border-line pt-3"><PriceBreakdown tiers={props.tiers} feeRate={props.feeRate} compact /></div>
      {props.children && <div className="mt-3">{props.children}</div>}
    </article>
  );
}
