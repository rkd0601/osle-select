import { createClient } from "@/lib/supabase/server";
import { tk } from "@/lib/i18n";

/** A-01 골격: v_admin_queue 지연 순 */
export default async function AdminHome() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_admin_queue").select("entity, id, status, due_at, overdue").order("due_at", { ascending: true }).limit(50);
  return (
    <div>
      <h1 className="text-[20px] font-bold">{tk("admin.queue")}</h1>
      <table className="mt-4 w-full text-[13px]">
        <thead className="text-left text-[11px] text-ink-2">
          <tr><th className="py-2">객체</th><th>상태</th><th>기한</th><th>지연</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {(data ?? []).map((r) => (
            <tr key={`${r.entity}-${r.id}`} className="bg-surface">
              <td className="py-2 pr-3">{r.entity} <span className="text-muted">{String(r.id).slice(0, 8)}</span></td>
              <td>{r.status}</td>
              <td className="num">{r.due_at ? new Date(r.due_at).toLocaleDateString("ko-KR") : "-"}</td>
              <td className={String(r.overdue ?? "").startsWith("-") ? "text-muted" : "text-crit"}>{r.overdue ? String(r.overdue) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
