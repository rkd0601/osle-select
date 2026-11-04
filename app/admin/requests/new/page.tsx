import { listBrandsForProxy } from "@/lib/db/admin/requests";
import { getCategories, getSettings } from "@/lib/db/settings";
import { RequestForm } from "@/components/domain/request-form";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { BackLink } from "../../_ui/ui";
import { createRequestOnBehalf } from "../actions";

/** A-02 대행 입력: 브랜드를 고른 뒤 B-02와 같은 양식. created_via=admin_proxy + 감사 로그(on_behalf_of_brand). */
export default async function ProxyRequestPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand: brandId } = await searchParams;
  const [brands, categories, settings] = await Promise.all([listBrandsForProxy(), getCategories(), getSettings()]);
  const brand = brands.find((b) => b.id === brandId);
  return (
    <div className="max-w-3xl">
      <BackLink href="/admin/requests" />
      <PageHeader eyebrow={tk("admin.requests.title")} title={tk("admin.requests.proxy")} description={tk("admin.requests.proxyLead")} />
      <form className="flex flex-wrap items-end gap-4">
        <label className="field min-w-60 flex-1" htmlFor="brand"><span className="lbl">{tk("admin.requests.proxy.brand")}</span>
          <select id="brand" name="brand" defaultValue={brand?.id ?? ""}>
            <option value="">-</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <button className="btn sec">{tk("admin.offers.pickBrand")}</button>
      </form>
      {brand && (
        <div className="mt-12 border-t border-line pt-10">
          <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix="/admin/requests/" submit={createRequestOnBehalf} minLeadDays={settings.min_lead_days} />
        </div>
      )}
    </div>
  );
}
