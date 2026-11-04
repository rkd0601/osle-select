import { requireBrandMember } from "@/lib/auth/session";
import { getCategories, getSettings } from "@/lib/db/settings";
import Link from "next/link";
import { tk } from "@/lib/i18n";
import { PageHeader } from "@/components/domain/page-header";
import { RequestForm } from "@/components/domain/request-form";
import { createRequest } from "../actions";

/** B-02 요청 */
export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/b/${slug}/requests`} className="btn btn-ghost btn-sm -ml-2 mb-3">{tk("common.back")}</Link>
      <PageHeader eyebrow={tk("eyebrow.requests")} title={tk("request.new.title")} description={tk("request.new.lead")} />
      <div>
        <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix={`/b/${slug}/requests/`} submit={createRequest} minLeadDays={settings.min_lead_days} />
      </div>
    </div>
  );
}

