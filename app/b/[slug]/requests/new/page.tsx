import { requireBrandMember } from "@/lib/auth/session";
import { getCategories, getSettings } from "@/lib/db/settings";
import Link from "next/link";
import { tk } from "@/lib/i18n";
import { RequestForm } from "@/components/domain/request-form";
import { createRequest } from "../actions";

/** B-02 요청 (디자인 v2 §5): 단일 칸 760 — 머리(제목 · 한 문장 · 단계 3) → 항목 → 요청 정보 → 바닥 줄 */
export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  return (
    <div className="mx-auto max-w-[760px]">
      <Link href={`/b/${slug}/requests`} className="inline-flex min-h-11 items-center text-meta text-muted hover:text-ink">{tk("common.backTo", { name: tk("nav.requests") })}</Link>
      <div className="phead mt-2" style={{ borderBottom: 0 }}>
        <div>
          <h1 className="h1">{tk("request.new.title")}</h1>
          <p className="sub">{tk("request.new.lead")}</p>
          <div className="stepper">
            <span><b>1</b> {tk("request.step.items")}</span>
            <span>2 {tk("request.step.info")}</span>
            <span>3 {tk("request.step.submit")}</span>
          </div>
        </div>
      </div>
      <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix={`/b/${slug}/requests/`} submit={createRequest} minLeadDays={settings.min_lead_days} />
    </div>
  );
}
