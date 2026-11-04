import Link from "next/link";
import { auditFilterOptions, auditLogs } from "@/lib/db/admin/audit";
import { AUDIT_PAGE_SIZE, AUDIT_TABS, isMoneyAction, parseAuditFilter, type AuditFilter } from "@/lib/audit";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs } from "@/components/domain/filter-tabs";
import { EmptyState } from "@/components/domain/empty-state";
import { TBL } from "../_ui/ui";

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
  const filtered = !!(f.actor || f.entity || f.action || f.from || f.to);
  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.manage")} title={tk("audit.title")} count={total}>
        <FilterTabs label={tk("admin.ui.tabsLabel")} active={f.tab}
          tabs={AUDIT_TABS.map((t) => ({ key: t, label: tk(`audit.tab.${t}`), href: `/admin/audit${qs(f, { tab: t, page: 1 })}`, tone: t === "proxy" ? "warn" : "default" }))} />
      </PageHeader>
      <form className="mb-8 grid items-end gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]" method="get">
        {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
        <label className="field"><span className="lbl">{tk("audit.f.actor")}</span>
          <select name="actor" defaultValue={f.actor ?? ""}>
            <option value="">{tk("audit.f.any")}</option>
            {opts.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="field"><span className="lbl">{tk("audit.f.entity")}</span>
          <select name="entity" defaultValue={f.entity ?? ""}>
            <option value="">{tk("audit.f.any")}</option>
            {opts.entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="field"><span className="lbl">{tk("audit.f.action")}</span><input name="action" defaultValue={f.action ?? ""} placeholder="order." className="num" /></label>
        <label className="field"><span className="lbl">{tk("audit.f.from")}</span><input type="date" name="from" defaultValue={f.from ?? ""} className="num" /></label>
        <label className="field"><span className="lbl">{tk("audit.f.to")}</span><input type="date" name="to" defaultValue={f.to ?? ""} className="num" /></label>
        <div className="flex items-center gap-4">
          <button className="btn sec">{tk("audit.f.apply")}</button>
          {filtered && <Link href={`/admin/audit${qs({ ...f, actor: undefined, entity: undefined, action: undefined, from: undefined, to: undefined }, { page: 1 })}`} className="link">{tk("audit.f.reset")}</Link>}
        </div>
      </form>
      {rows.length === 0 ? (
        filtered
          ? <EmptyState title={tk("admin.ui.filtered.title")} action={{ href: "/admin/audit", label: tk("admin.ui.filtered.reset") }} />
          : <EmptyState title={tk("audit.empty")} />
      ) : (
        <table className={TBL}>
          <thead>
            <tr>
              <th className="w-32">{tk("admin.audit.col.at")}</th>
              <th className="w-32">{tk("admin.audit.col.actor")}</th>
              <th>{tk("audit.f.action")}</th>
              <th>{tk("audit.f.entity")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.on_behalf_of_brand_id ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-warn [&>td:first-child]:pl-3" : ""}>
                <td className="num align-top text-meta text-muted">{fmtDate(r.created_at, "ko", true)}</td>
                <td className="align-top text-meta">{r.actor ?? <span className="text-muted">{tk("audit.system")}</span>}</td>
                <td className="num align-top text-meta">
                  {isMoneyAction(r.action) && <span className="mr-1.5 text-ink-2" aria-label={tk("audit.tab.money")}>₩</span>}
                  {r.action}
                  {r.proxyBrand && <span className="mt-0.5 block text-caption text-warn">{tk("audit.proxy", { brand: r.proxyBrand })}</span>}
                </td>
                <td className="min-w-0 align-top text-meta">
                  <span className="num text-ink-2">{r.entity}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ""}</span>
                  {r.diff != null && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-caption text-ink-2 hover:text-ink">{tk("audit.diff")}</summary>
                      <pre className="num mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all border-l border-line-strong pl-3 text-caption text-ink-2">{JSON.stringify(r.diff, null, 2)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <nav aria-label={tk("admin.ui.pages")} className="mt-8 flex items-center justify-center gap-4 text-meta">
          {f.page > 1 ? <Link href={`/admin/audit${qs(f, { page: f.page - 1 })}`} className="btn sec sm">{tk("audit.prev")}</Link> : <span className="btn sec sm" aria-disabled="true">{tk("audit.prev")}</span>}
          <span className="num text-ink-2">{f.page} / {pages}</span>
          {f.page < pages ? <Link href={`/admin/audit${qs(f, { page: f.page + 1 })}`} className="btn sec sm">{tk("audit.next")}</Link> : <span className="btn sec sm" aria-disabled="true">{tk("audit.next")}</span>}
        </nav>
      )}
    </div>
  );
}
