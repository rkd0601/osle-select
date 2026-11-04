import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getMyProduct } from "@/lib/db/cn/products";
import { getItemBrand, listBrandsForIssue, listOffersForProduct, listOpenItemsForBrand } from "@/lib/db/admin/products";
import { getSettings } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { resolveInherited } from "@/lib/products";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { IssueForm } from "./issue-form";

/**
 * A-04 제안 발행 화면: 상품 요약 + 이 상품의 제안 이력(브랜드별 반응·사유) + 브랜드 선택 → 발행 폼.
 * 기본 브랜드·항목은 상품이 들어온 요청 항목(source_request_item_id).
 */
export default async function AdminIssue({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ brand?: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const u = await requireRole(["ADMIN"], "/admin/offers");
  const data = await getMyProduct({ id: u.id, role: u.role }, id);
  if (!data) notFound();
  const { product: p, cost, images, vendor, checks } = data;
  const { brand: brandParam } = await searchParams;
  const [brands, offers, settings, source] = await Promise.all([
    listBrandsForIssue(),
    listOffersForProduct(id),
    getSettings(),
    p.source_request_item_id ? getItemBrand(p.source_request_item_id) : Promise.resolve(null),
  ]);
  const brandId = brandParam && brands.some((b) => b.id === brandParam) ? brandParam : (source?.brand_id ?? brands[0]?.id);
  const brand = brands.find((b) => b.id === brandId);
  const items = brand ? await listOpenItemsForBrand(brand.id) : [];
  const urls = await signedReadUrls("productImages", images.slice(0, 4).map((i) => i.storage_path));
  const inh = resolveInherited(p, vendor);
  const issuable = ["reviewed", "offering", "repool"].includes(p.status) && checks.every((c) => c.ok);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <Link href="/admin/offers" className="text-meta text-muted">{tk("common.back")}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-bold">{p.name_ko || p.name_zh}</h1>
          <StatusPill entity="product" status={p.status} />
          {p.code && <span className="num text-meta text-muted">{p.code}</span>}
          <Link href={`/admin/products/${p.id}`} className="text-meta text-signature">{tk("issue.toReview")} →</Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {images.slice(0, 4).map((i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
            <img key={i.id} src={urls[i.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
          ))}
        </div>
        <section>
          <h2 className="text-body font-semibold">{tk("issue.history")}</h2>
          {offers.length === 0 ? <p className="mt-1 text-meta text-muted">{tk("issue.noHistory")}</p> : (
            <table className="mt-2 w-full text-meta">
              <thead className="text-left text-muted"><tr><th className="py-1">{tk("admin.requests.col.brand")}</th><th>{tk("issue.typeCol")}</th><th>{tk("admin.requests.col.status")}</th><th>{tk("issue.exclusiveCol")}</th><th>{tk("issue.issuedAt")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {offers.map((o) => {
                  const b = Array.isArray(o.brands) ? o.brands[0] : o.brands;
                  return (
                    <tr key={o.id}>
                      <td className="py-1">{b?.name}</td>
                      <td>{tk(`issue.type.${o.type}`)}</td>
                      <td>{tk(`status.offer.${o.status}`)}{o.decline_reason ? ` · ${tk(`decline.${o.decline_reason}`)}` : ""}</td>
                      <td className="num">{o.exclusive_until ?? "-"}</td>
                      <td className="num">{fmtDate(o.issued_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <aside className="space-y-3">
        <form className="flex items-end gap-2 text-meta">
          <label className="flex-1 text-caption text-ink-2">{tk("issue.brand")}
            <select name="brand" defaultValue={brandId} className="mt-1 w-full border border-line bg-surface px-2 py-1.5 text-body">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <button className="border border-ink px-3 py-1.5">{tk("common.ok")}</button>
        </form>
        {!issuable && (
          <p className="bg-warn-soft px-3 py-2 text-meta text-warn">
            {tk("issue.notIssuable")}
            {checks.some((c) => !c.ok) && <span className="mt-1 block">{tk("issue.failingChecks")}: {checks.filter((c) => !c.ok).map((c) => tk(`product.check.${c.key}`)).join(" · ")}</span>}
          </p>
        )}
        {issuable && brand && (
          <IssueForm
            key={brand.id}
            productId={p.id}
            brand={brand}
            items={items}
            defaultItemId={p.source_request_item_id}
            priorOfferCount={offers.length}
            costTiers={cost.tiers}
            weightG={p.weight_g}
            labels={inh.labelOptions}
            mods={inh.modOptions}
            settings={{
              fee_rate: settings.fee_rate, hidden_margin_rate: settings.hidden_margin_rate, fx_rate_cny_krw: settings.fx_rate_cny_krw,
              sample_air_per_kg_krw: settings.sample_air_per_kg_krw, domestic_shipping_krw: settings.domestic_shipping_krw,
              exclusive_days: settings.exclusive_days, offer_valid_days: settings.offer_valid_days, target_diff_pct: settings.target_diff_pct,
            }}
          />
        )}
      </aside>
    </div>
  );
}
