import { requireBrandMember } from "@/lib/auth/session";
import { getCategories, getSettings } from "@/lib/db/settings";
import { tk } from "@/lib/i18n";
import { RequestForm } from "@/components/domain/request-form";
import { createRequest } from "../actions";
import { BackLink } from "../../_ui/list";

/** B-02 요청 (디자인 v2.2): 12칸 — 머리 8(제목 · 한 문장 · 단계 3) → 잉크 룰 → 본문 8(항목 → 요청 정보 → 바닥 줄) */
export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8">
        <h1 className="h1">{tk("request.new.title")}</h1>
        <p className="lead mt-2.5">{tk("request.new.lead")}</p>
        <div className="stepper">
          <span><b>1</b> {tk("request.step.items")}</span>
          <span>2 {tk("request.step.info")}</span>
          <span>3 {tk("request.step.submit")}</span>
        </div>
      </div>
      <div className="c12 rule-ink" />
      <div className="c8 min-w-0">
        <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix={`/b/${slug}/requests/`} submit={createRequest} minLeadDays={settings.min_lead_days} />
      </div>
    </div>
  );
}
