import Link from "next/link";
import { tk } from "@/lib/i18n";

/**
 * 발주 받는 곳 (COWORK_DECISIONS d-30): 발주서에는 입력을 두지 않는다 — 브랜드 기본 배송지로 고정, 읽기 전용 + "설정에서 바꾸기".
 * 출고 시점 스냅샷 칼럼은 다음 마이그레이션 몫(d-30 "지금은 안 함"). 발주서 작성·발주 상세가 같이 쓴다.
 */
export function ShipToLine({ address, settingsHref, className = "" }: { address: { name?: string; phone?: string; address?: string } | null; settingsHref: string; className?: string }) {
  const line = address?.address ? [address.name, address.phone, address.address].filter(Boolean).join(" · ") : null;
  return (
    <section className={`border-t border-line pt-4 ${className}`} aria-label={tk("order.shipTo")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="label">{tk("order.shipTo")}</span>
        <Link href={settingsHref} className="link text-meta">{tk("order.shipTo.change")}</Link>
      </div>
      <p className={`mt-2 text-body ${line ? "text-ink" : "text-warn"}`}>{line ?? tk("order.shipTo.none")}</p>
      <p className="mt-1 text-caption text-muted">{tk("order.shipTo.help")}</p>
    </section>
  );
}
