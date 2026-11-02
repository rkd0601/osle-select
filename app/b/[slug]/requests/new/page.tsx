import { requireBrandMember } from "@/lib/auth/session";
import { getCategories, getSettings } from "@/lib/db/settings";
import { tk } from "@/lib/i18n";
import { RequestForm } from "@/components/domain/request-form";
import { createRequest } from "../actions";

/** B-02 요청 */
export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-title-l font-bold leading-tight tracking-tight">{tk("request.new.title")}</h1>
      <p className="mt-2 max-w-lg text-lead text-ink-2">{tk("request.new.lead")}</p>
      <div className="mt-8">
        <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix={`/b/${slug}/requests/`} submit={createRequest} minLeadDays={settings.min_lead_days} />
      </div>
    </div>
  );
}

