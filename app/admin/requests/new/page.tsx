import Link from "next/link";
import { listBrandsForProxy } from "@/lib/db/admin/requests";
import { getCategories, getSettings } from "@/lib/db/settings";
import { RequestForm } from "@/components/domain/request-form";
import { tk } from "@/lib/i18n";
import { createRequestOnBehalf } from "../actions";

/** A-02 대행 입력: 브랜드를 고른 뒤 B-02와 같은 양식. created_via=admin_proxy + 감사 로그(on_behalf_of_brand). */
export default async function ProxyRequestPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand: brandId } = await searchParams;
  const [brands, categories, settings] = await Promise.all([listBrandsForProxy(), getCategories(), getSettings()]);
  const brand = brands.find((b) => b.id === brandId);
  return (
    <div className="max-w-2xl">
      <Link href="/admin/requests" className="text-meta text-muted">{tk("common.back")}</Link>
      <h1 className="mt-2 text-h2 font-bold">{tk("admin.requests.proxy")}</h1>
      <form className="mt-4 flex items-center gap-2 text-body">
        <label className="text-ink-2" htmlFor="brand">{tk("admin.requests.proxy.brand")}</label>
        <select id="brand" name="brand" defaultValue={brand?.id ?? ""} className="border border-line bg-surface px-2 py-1.5">
          <option value="">-</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button className="border border-ink px-3 py-1.5">{tk("common.ok")}</button>
      </form>
      {brand && (
        <div className="mt-8">
          <RequestForm brandId={brand.id} categories={categories} doneHrefPrefix="/admin/requests/" submit={createRequestOnBehalf} minLeadDays={settings.min_lead_days} />
        </div>
      )}
    </div>
  );
}
