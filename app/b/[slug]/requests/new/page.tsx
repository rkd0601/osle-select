import { requireBrandMember } from "@/lib/auth/session";
import { getCategories, getSettings } from "@/lib/db/settings";
import { tk } from "@/lib/i18n";
import { RequestForm } from "@/components/domain/request-form";
import { createRequest } from "../actions";

/**
 * B-02 요청 작성 (디자인 v2.3, 프로토타입 v-request): 12칸 — 머리 c8(제목 · 한 문장) / c4 빈칸 →
 * 본문 c8(스타일 카드 → "+ 스타일 추가" → 요청 전체) / c4 sticky 레일. 본문과 레일은 RequestForm이 그리드 자식으로 낸다.
 * 가짜 단계 표시(1·2·3)는 없앴다. 올리면 접수 완료(`?submitted=1`)로.
 */
export default async function NewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  return (
    <div className="g12">
      <div className="c8">
        <h1 className="h1">{tk("request.new.title")}</h1>
        <p className="lead" style={{ marginTop: 10 }}>{tk("request.style.lead")}</p>
      </div>
      <div className="c4" />
      <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix={`/b/${slug}/requests/`} doneHrefSuffix="?submitted=1"
        submit={createRequest} minLeadDays={settings.min_lead_days} />
    </div>
  );
}
