import Link from "next/link";
import { auditFilterOptions, auditLogs } from "@/lib/db/admin/audit";
import { AUDIT_PAGE_SIZE, AUDIT_TABS, isMoneyAction, parseAuditFilter, type AuditFilter } from "@/lib/audit";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";

/**
 * 감사 로그 (CLAUDE.md 절대 규칙 12): 대행·가격·발주 확정·입금 확인·환율/마진 변경을 한 화면에서. 필터는 GET 폼(링크 공유 가능).
 * 대행 행(on_behalf_of_brand_id)은 강조하고, 돈 관련 액션은 탭으로 모아 본다.
 */
const qs = (f: AuditFilter, patch: Partial<AuditFilter>) => {
  const v = { ...f, ...patch };
  const p = new URLSearchParams();
  for (const [k, x] of Object.entries(v)) if (x != null && x !== "" && !(k === "tab" && x === "all") && !(k === "page" && x === 1)) p.set(k, String(x));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseAuditFilter(await searchParams);
  const [{ rows, total }, opts] = await Promise.all([auditLogs(f), auditFilterOptions()]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const field = "border-0 border-b border-line bg-transparent py-1 text-[12px] outline-none";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">{tk("audit.title")}</h1>
        <p className="mt-1 text-[13px] text-ink-2">{tk("audit.lead")}</p>
      </div>
      <nav className="flex gap-1 border-b border-line text-[13px]">
        {AUDIT_TABS.map((t) => (
          <Link key={t} href={`/admin/audit${qs(f, { tab: t, page: 1 })}`} className={`px-3 py-2 ${f.tab === t ? "border-b-2 border-ink font-semibold" : "text-ink-2"}`}>{tk(`audit.tab.${t}`)}</Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-4" method="get">
        {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
        <label className="text-[11px] text-muted">{tk("audit.f.actor")}
          <select name="actor" defaultValue={f.actor ?? ""} className={`${field} block w-44`}>
            <option value="">{tk("audit.f.any")}</option>
            {opts.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-muted">{tk("audit.f.entity")}
          <select name="entity" defaultValue={f.entity ?? ""} className={`${field} block w-36`}>
            <option value="">{tk("audit.f.any")}</option>
            {opts.entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-muted">{tk("audit.f.action")}<input name="action" defaultValue={f.action ?? ""} placeholder="order." className={`${field} num block w-36`} /></label>
        <label className="text-[11px] text-muted">{tk("audit.f.from")}<input type="date" name="from" defaultValue={f.from ?? ""} className={`${field} num block`} /></label>
        <label className="text-[11px] text-muted">{tk("audit.f.to")}<input type="date" name="to" defaultValue={f.to ?? ""} className={`${field} num block`} /></label>
        <button className="bg-ink px-3 py-1.5 text-[12px] font-medium text-paper">{tk("audit.f.apply")}</button>
        <Link href="/admin/audit" className="text-[12px] text-muted">{tk("audit.f.reset")}</Link>
      </form>
      <p className="num text-[12px] text-muted">{tk("audit.count", { n: total })}</p>
      {rows.length === 0 ? <p className="text-[13px] text-muted">{tk("audit.empty")}</p> : (
        <ul className="divide-y divide-line border-y border-line text-[12px]">
          {rows.map((r) => (
            <li key={r.id} className={`grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[128px_120px_200px_1fr] ${r.on_behalf_of_brand_id ? "bg-warn-soft" : ""}`}>
              <span className="num text-muted">{fmtDate(r.created_at, "ko", true)}</span>
              <span>{r.actor ?? tk("audit.system")}</span>
              <span className="num">
                {isMoneyAction(r.action) && <span className="mr-1 text-signature" aria-label={tk("audit.tab.money")}>₩</span>}
                {r.action}
                {r.proxyBrand && <span className="ml-1 block text-[11px] font-medium text-warn">{tk("audit.proxy", { brand: r.proxyBrand })}</span>}
              </span>
              <span className="min-w-0">
                <span className="num text-ink-2">{r.entity}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ""}</span>
                {r.diff != null && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-muted">{tk("audit.diff")}</summary>
                    <pre className="num mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-surface p-2 text-[11px]">{JSON.stringify(r.diff, null, 2)}</pre>
                  </details>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-3 text-[12px]">
          {f.page > 1 && <Link href={`/admin/audit${qs(f, { page: f.page - 1 })}`} className="underline-offset-4 hover:underline">{tk("audit.prev")}</Link>}
          <span className="num text-muted">{f.page} / {pages}</span>
          {f.page < pages && <Link href={`/admin/audit${qs(f, { page: f.page + 1 })}`} className="underline-offset-4 hover:underline">{tk("audit.next")}</Link>}
        </div>
      )}
    </div>
  );
}
