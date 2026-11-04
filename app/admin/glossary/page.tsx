import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { EmptyState } from "@/components/domain/empty-state";
import { tk } from "@/lib/i18n/admin";
import { ListEmpty, Section, Toolbar, matchQ, sp, type SearchParams } from "../_ui/ui";
import { AddTermForm, TermRow } from "./glossary-forms";

/**
 * 용어 사전 (PRD D12): 탭 = 승인 대기 / 승인된 용어(검색). 번역에는 승인된 것만 들어간다.
 * 기본 탭은 대기 용어가 있으면 승인 대기, 없으면 승인된 용어.
 */
export default async function AdminGlossary({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const q = (sp(p.q) ?? "").trim().slice(0, 40);
  const db = createAdminClient();
  const like = q.replace(/[%_,()]/g, "");
  let approvedQ = db.from("glossary").select("id, term_zh, term_ko, category, approved").eq("approved", true).order("term_ko").limit(300);
  if (like) approvedQ = approvedQ.or(`term_zh.ilike.%${like}%,term_ko.ilike.%${like}%`);
  const [{ data: pendingAll }, { data: approved }, { count }] = await Promise.all([
    db.from("glossary").select("id, term_zh, term_ko, category, approved").eq("approved", false).order("created_at").limit(200),
    approvedQ,
    db.from("glossary").select("id", { count: "exact", head: true }).eq("approved", true),
  ]);
  const pending = (pendingAll ?? []).filter((t) => matchQ(q, t.term_zh, t.term_ko, t.category));
  const tab = sp(p.tab) === "pending" || sp(p.tab) === "approved" ? sp(p.tab)! : (pendingAll?.length ? "pending" : "approved");
  const list = tab === "pending" ? pending : (approved ?? []);
  const cur = { q: q || undefined, tab };

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={tk("admin.nav.group.manage")} title={tk("glossary.title")} count={count ?? 0} description={tk("glossary.lead")} />
      <Section title={tk("glossary.addTitle")}>
        <AddTermForm />
      </Section>
      <section className="pt-12">
        <div className="mb-6">
          <FilterTabs label={tk("admin.ui.tabsLabel")} active={tab}
            tabs={[
              { key: "pending", label: tk("glossary.pending"), count: pending.length, tone: "warn", href: withQuery("/admin/glossary", cur, { tab: "pending" }) },
              { key: "approved", label: tk("glossary.approved"), count: q ? (approved?.length ?? 0) : (count ?? 0), href: withQuery("/admin/glossary", cur, { tab: "approved" }) },
            ]} />
        </div>
        <Toolbar>
          <SearchBox className="w-full max-w-sm" placeholder={tk("admin.glossary.searchPh")} label={tk("glossary.search")} />
        </Toolbar>
        {list.length === 0 ? (
          q ? <ListEmpty filtered resetHref={withQuery("/admin/glossary", { tab }, {})} title="" />
            : <EmptyState title={tab === "pending" ? tk("glossary.noPending") : tk("glossary.none")} />
        ) : (
          <div>
            <div aria-hidden className="flex gap-3 border-b border-line-strong pb-2.5 text-caption text-muted">
              <span className="w-40">{tk("glossary.zh")}</span><span className="w-40">{tk("glossary.ko")}</span><span className="w-28">{tk("glossary.category")}</span>
            </div>
            <ul>{list.map((t) => <TermRow key={t.id} term={t} />)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}
