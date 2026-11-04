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
import { PageHeader } from "@/components/domain/page-header";
import { Photo } from "@/components/domain/photo";
import { BackLink, DetailLayout, Section } from "../../_ui/ui";
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
    <div>
      <BackLink href="/admin/offers" />
      <PageHeader eyebrow={[tk("entity.product"), p.code].filter(Boolean).join(" · ")} title={p.name_ko || p.name_zh || p.id.slice(0, 8)}
        actions={<Link href={`/admin/products/${p.id}`} className="btn btn-secondary btn-sm">{tk("issue.toReview")} →</Link>}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill entity="product" status={p.status} />
          <span className="num text-meta text-ink-2">{tk("admin.offers.historyCount", { n: offers.length })}</span>
        </div>
      </PageHeader>
      <DetailLayout
        asideWidth="420px"
        main={
          <>
            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {images.slice(0, 4).map((i) => <Photo key={i.id} src={urls[i.storage_path]} />)}
              </div>
            )}
            <Section title={tk("issue.history")} count={offers.length} flush>
              {offers.length === 0 ? <p className="card-pad text-body text-ink-2">{tk("issue.noHistory")}</p> : (
                <table className="table-ui">
                  <thead>
                    <tr>
                      <th>{tk("admin.requests.col.brand")}</th>
                      <th>{tk("issue.typeCol")}</th>
                      <th>{tk("admin.requests.col.status")}</th>
                      <th className="text-right">{tk("issue.exclusiveCol")}</th>
                      <th className="text-right">{tk("issue.issuedAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => {
                      const b = Array.isArray(o.brands) ? o.brands[0] : o.brands;
                      return (
                        <tr key={o.id} className={o.brand_id === brandId ? "[&>td]:bg-signature-soft/50" : ""}>
                          <td className="font-medium">{b?.name}</td>
                          <td className="text-meta text-ink-2">{tk(`issue.type.${o.type}`)}</td>
                          <td className="text-meta">
                            <span className={o.status === "interested" ? "font-semibold text-signature" : o.status === "declined" ? "text-ink-2" : ""}>{tk(`status.offer.${o.status}`)}</span>
                            {o.decline_reason && <span className="ml-1 text-ink-2">· {tk(`decline.${o.decline_reason}`)}</span>}
                          </td>
                          <td className="num text-right text-ink-2">{o.exclusive_until ?? "-"}</td>
                          <td className="num text-right text-ink-2">{fmtDate(o.issued_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          </>
        }
        aside={
          <Section title={tk("admin.offers.issueTitle")} tone={issuable ? "brand" : "warn"}>
            <form className="mb-4 flex items-end gap-2">
              <label className="block flex-1 text-caption font-medium text-ink-2">{tk("issue.brand")}
                <select name="brand" defaultValue={brandId} className="field mt-1">
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <button className="btn btn-secondary">{tk("admin.offers.pickBrand")}</button>
            </form>
            {!issuable && (
              <div className="rounded-ui bg-warn-soft px-3 py-2 text-meta text-warn">
                {tk("issue.notIssuable")}
                {checks.some((c) => !c.ok) && <span className="mt-1 block font-medium">{tk("issue.failingChecks")}: {checks.filter((c) => !c.ok).map((c) => tk(`product.check.${c.key}`)).join(" · ")}</span>}
              </div>
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
          </Section>
        }
      />
    </div>
  );
}
