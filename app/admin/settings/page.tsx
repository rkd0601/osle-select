import { getBankAccount, getCategories, getRejectionTemplates, getSettings } from "@/lib/db/settings";
import { settingsHistory } from "@/lib/db/admin/audit";
import { NUMERIC_SETTINGS, SETTING_GROUPS } from "@/lib/settings-schema";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { BankAccountEditor, CategoriesEditor, NumericSettingRow, RejectionTemplatesEditor } from "./settings-forms";

/**
 * A-08 설정 (PRD 5장). 변경은 감사 로그·이력으로 남고, 발행된 제안·확정된 청구 내역은 그 시점 값 그대로다(절대 규칙 3·5).
 * 환율 저장 = 즉시 환율 재확인 배치(DECISIONS r6-3).
 */
export default async function AdminSettings() {
  const [s, categories, templates, bank, history] = await Promise.all([getSettings(), getCategories(), getRejectionTemplates(), getBankAccount(), settingsHistory(20)]);
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-h1 font-bold tracking-tight">{tk("settings.title")}</h1>
        <p className="mt-1 text-body text-ink-2">{tk("settings.lead")}</p>
      </div>
      {SETTING_GROUPS.map((g) => (
        <section key={g}>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk(`settings.group.${g}`)}</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {NUMERIC_SETTINGS.filter((d) => d.group === g).map((d) => <NumericSettingRow key={d.key} def={d} value={s[d.key]} />)}
          </ul>
        </section>
      ))}
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("settings.list.categories")}</h2>
        <div className="mt-2"><CategoriesEditor value={categories} /></div>
      </section>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("settings.list.rejection_templates")}</h2>
        <div className="mt-2"><RejectionTemplatesEditor value={templates} /></div>
      </section>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("settings.list.bank_account")}</h2>
        <div className="mt-2"><BankAccountEditor value={bank} /></div>
      </section>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("settings.history")}</h2>
        {history.length === 0 ? <p className="mt-2 text-body text-muted">{tk("settings.noHistory")}</p> : (
          <ul className="mt-2 divide-y divide-line border-y border-line text-meta">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-3 py-2">
                <span className="num w-32 text-muted">{fmtDate(h.changed_at, "ko", true)}</span>
                <span className="w-48">{tk(`settings.key.${h.key}`)}</span>
                <span className="num break-all text-ink-2">{JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)}</span>
                <span className="ml-auto text-muted">{h.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
