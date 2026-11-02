import Link from "next/link";
import { listProductsForAdmin } from "@/lib/db/admin/products";
import { signedReadUrls } from "@/lib/storage";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";

const TABS = [
  ["queue", ["pending_review", "recheck"]],
  ["reviewed", ["reviewed", "repool"]],
  ["offering", ["offering"]],
  ["rejected", ["rejected", "hidden"]],
] as const;

/** A-03 상품 검수 큐: 검수 대기 + 재확인, 기한 순(지연 먼저). 레이아웃이 ADMIN을 검증한다. */
export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const current = TABS.find(([k]) => k === tab) ?? TABS[0];
  const rows = await listProductsForAdmin([...current[1]]);
  const covers = await signedReadUrls("productImages", rows.flatMap((r) => (r.cover ? [r.cover] : [])));
  return (
    <div>
      <h1 className="text-h2 font-bold">{tk("review.title")}</h1>
      <nav className="mt-3 flex gap-1 border-b border-line text-meta">
        {TABS.map(([k]) => (
          <Link key={k} href={`/admin/products?tab=${k}`} className={`px-3 py-2 ${current[0] === k ? "border-b-2 border-ink font-semibold" : "text-ink-2"}`}>{tk(`review.tab.${k}`)}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="py-10 text-body text-ink-2">{tk("review.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line bg-surface">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/products/${p.id}`} className="grid grid-cols-[48px_1fr_auto_auto] items-center gap-3 px-3 py-2 text-body hover:bg-paper">
                {p.cover && covers[p.cover] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                  <img src={covers[p.cover]} alt="" className="aspect-[3/4] w-12 bg-sand object-cover" />
                ) : <span className="aspect-[3/4] w-12 bg-sand" />}
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name_ko || p.name_zh || p.id.slice(0, 8)}</div>
                  <div className="text-caption text-muted">{[p.code, p.category, p.vendorName, p.trustScore != null ? `${tk("admin.vendors.trust")} ${p.trustScore}` : null].filter(Boolean).join(" · ")}</div>
                  {p.status === "recheck" && p.recheck_reason && <div className="text-caption text-warn">{p.recheck_reason.split(",").map((f: string) => tk(`product.field.${f}`)).join(" · ")}</div>}
                </div>
                <StatusPill entity="product" status={p.status} />
                <span className={`num text-meta ${isOverdue(p.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(p.due_at, "ko", true)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
