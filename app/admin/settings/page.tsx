import { getBankAccount, getCategories, getRejectionTemplates, getSettings } from "@/lib/db/settings";
import { settingsHistory } from "@/lib/db/admin/audit";
import { NUMERIC_SETTINGS, SETTING_GROUPS } from "@/lib/settings-schema";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { Section } from "../_ui/ui";
import { BankAccountEditor, CategoriesEditor, NumericSettingRow, RejectionTemplatesEditor } from "./settings-forms";

/**
 * A-08 설정 (PRD 5장). 변경은 감사 로그·이력으로 남고, 발행된 제안·확정된 청구 내역은 그 시점 값 그대로다(절대 규칙 3·5).
 * 환율 저장 = 즉시 환율 재확인 배치(DECISIONS r6-3).
 */
export default async function AdminSettings() {
  const [s, categories, templates, bank, history] = await Promise.all([getSettings(), getCategories(), getRejectionTemplates(), getBankAccount(), settingsHistory(20)]);
  const sections: [string, string][] = [
    ...SETTING_GROUPS.map((g) => [`g-${g}`, tk(`settings.group.${g}`)] as [string, string]),
    ["categories", tk("settings.list.categories")],
    ["templates", tk("admin.settings.templatesShort")],
    ["bank", tk("admin.settings.bankShort")],
    ["history", tk("settings.history")],
  ];
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={tk("admin.nav.group.manage")} title={tk("settings.title")} description={tk("settings.lead")}>
        <nav aria-label={tk("admin.settings.jump")} className="flex flex-wrap gap-2">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="chip">{label}</a>)}
        </nav>
      </PageHeader>
      <div className="space-y-6">
        {SETTING_GROUPS.map((g) => (
          <Section key={g} id={`g-${g}`} title={tk(`settings.group.${g}`)} className="scroll-mt-6">
            <ul className="-my-2.5 divide-y divide-line">
              {NUMERIC_SETTINGS.filter((d) => d.group === g).map((d) => <NumericSettingRow key={d.key} def={d} value={s[d.key]} />)}
            </ul>
          </Section>
        ))}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section id="categories" title={tk("settings.list.categories")} className="scroll-mt-6"><CategoriesEditor value={categories} /></Section>
          <Section id="bank" title={tk("settings.list.bank_account")} className="scroll-mt-6"><BankAccountEditor value={bank} /></Section>
        </div>
        <Section id="templates" title={tk("settings.list.rejection_templates")} className="scroll-mt-6"><RejectionTemplatesEditor value={templates} /></Section>
        <Section id="history" title={tk("settings.history")} count={history.length || null} className="scroll-mt-6" flush>
          {history.length === 0 ? <p className="card-pad text-body text-ink-2">{tk("settings.noHistory")}</p> : (
            <table className="table-ui">
              <thead>
                <tr>
                  <th className="w-32">{tk("admin.audit.col.at")}</th>
                  <th>{tk("admin.settings.col.key")}</th>
                  <th>{tk("admin.settings.col.change")}</th>
                  <th className="text-right">{tk("admin.audit.col.actor")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="num text-meta text-ink-2">{fmtDate(h.changed_at, "ko", true)}</td>
                    <td className="text-meta">{tk(`settings.key.${h.key}`)}</td>
                    <td className="num break-all text-meta text-ink-2">{JSON.stringify(h.old_value)} → <span className="font-semibold text-ink">{JSON.stringify(h.new_value)}</span></td>
                    <td className="text-right text-meta text-ink-2">{h.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}
