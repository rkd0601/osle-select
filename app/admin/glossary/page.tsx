import { createAdminClient } from "@/lib/supabase/admin";
import { tk } from "@/lib/i18n/admin";
import { AddTermForm, TermRow } from "./glossary-forms";

/** 용어 사전 (PRD D12): 승인 대기 → 승인된 용어(검색). 번역에는 승인된 것만 들어간다 */
export default async function AdminGlossary({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 40);
  const db = createAdminClient();
  const like = q.replace(/[%_,()]/g, "");
  let approvedQ = db.from("glossary").select("id, term_zh, term_ko, category, approved").eq("approved", true).order("term_ko").limit(300);
  if (like) approvedQ = approvedQ.or(`term_zh.ilike.%${like}%,term_ko.ilike.%${like}%`);
  const [{ data: pending }, { data: approved }, { count }] = await Promise.all([
    db.from("glossary").select("id, term_zh, term_ko, category, approved").eq("approved", false).order("created_at").limit(200),
    approvedQ,
    db.from("glossary").select("id", { count: "exact", head: true }).eq("approved", true),
  ]);
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-h1 font-bold tracking-tight">{tk("glossary.title")}</h1>
        <p className="mt-1 text-body text-ink-2">{tk("glossary.lead")}</p>
      </div>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("glossary.addTitle")}</h2>
        <div className="mt-2"><AddTermForm /></div>
      </section>
      <section>
        <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("glossary.pending")} <span className="num">{pending?.length ?? 0}</span></h2>
        {!pending?.length ? <p className="mt-2 text-body text-ink-2">{tk("glossary.noPending")}</p> : (
          <ul className="mt-2 divide-y divide-line border-y border-line">{pending.map((t) => <TermRow key={t.id} term={t} />)}</ul>
        )}
      </section>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">{tk("glossary.approved")} <span className="num">{count ?? 0}</span></h2>
          <form method="get"><input name="q" defaultValue={q} placeholder={tk("glossary.search")} className="border-0 border-b border-line bg-transparent py-1 text-body outline-none" aria-label={tk("glossary.search")} /></form>
        </div>
        {!approved?.length ? <p className="mt-2 text-body text-ink-2">{tk("glossary.none")}</p> : (
          <ul className="mt-2 divide-y divide-line border-y border-line">{approved.map((t) => <TermRow key={t.id} term={t} />)}</ul>
        )}
      </section>
    </div>
  );
}
