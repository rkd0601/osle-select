import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { t } from "@/lib/i18n";

/** C-01 골격: 배정된 요청 항목 (v_request_items_cn: VENDOR는 브랜드명·희망 단가 마스킹) */
export default async function CnHome() {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const supabase = await createClient();
  const { data } = await supabase.from("v_request_items_cn").select("id, seq, category, description_zh, expected_qty_range, status, due_at, brand_label, target_price_krw").order("due_at");
  return (
    <div>
      <h1 className="text-[20px] font-bold">{t(u.locale, "cn.items")} ({data?.length ?? 0})</h1>
      <ul className="mt-4 divide-y divide-line rounded-[var(--radius)] border border-line bg-surface">
        {(data ?? []).map((it) => (
          <li key={it.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
            <div>
              <div className="font-medium">#{it.seq} {it.description_zh ?? it.category}</div>
              <div className="text-muted">{it.brand_label} · {it.expected_qty_range ?? "-"} {it.target_price_krw ? `· 目标 ₩${it.target_price_krw.toLocaleString()}` : ""}</div>
            </div>
            <span className="num text-muted">{it.due_at ? new Date(it.due_at).toLocaleDateString("zh-CN") : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
