import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyItems } from "@/lib/db/cn/requests";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n";

/** C-01 내 요청 항목 (v_request_items_cn: VENDOR는 브랜드명·희망 단가 마스킹). 기한 순. */
export default async function CnHome() {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
  const items = await listMyItems();
  return (
    <div>
      <h1 className="text-[20px] font-bold">{t(L, "cn.items")} <span className="num text-muted">{items.length}</span></h1>
      {items.length === 0 ? (
        <p className="py-10 text-[13px] text-muted">{t(L, "cn.item.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line bg-surface">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={`/cn/items/${it.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] hover:bg-paper">
                <div className="min-w-0">
                  <div className="truncate font-medium">#{it.seq} {it.description_zh ?? t(L, "cn.item.noZh")}</div>
                  <div className="text-muted">{it.brand_label} · {it.expected_qty_range ?? "-"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`num ${isOverdue(it.due_at) ? "font-semibold text-crit" : "text-muted"}`}>{fmtDate(it.due_at, L)}</span>
                  <StatusPill entity="request_item" status={it.status} locale={L} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
