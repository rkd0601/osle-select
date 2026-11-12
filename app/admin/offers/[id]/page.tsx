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
import { fmtDate, fmtDay } from "@/lib/format";
import { exclusiveHolder, isLive } from "@/lib/offers";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { Photo } from "@/components/domain/photo";
import { BackLink, DetailLayout, Section, TBL } from "../../_ui/ui";
import { BlockedNote, IssueForm } from "./issue-form";

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
  // 요청에서 온 상품이 아니면 브랜드를 미리 고르지 않는다 — 목록 첫 브랜드로 잘못 보낼 위험 (11-12 점검)
  const brandId = brandParam && brands.some((b) => b.id === brandParam) ? brandParam : (source?.brand_id ?? null);
  const brand = brands.find((b) => b.id === brandId);
  const items = brand ? await listOpenItemsForBrand(brand.id) : [];
  const urls = await signedReadUrls("productImages", images.slice(0, 4).map((i) => i.storage_path));
  const inh = resolveInherited(p, vendor);
  // A2 (NEXT §0-g): 막힌 이유를 누르기 전에 — 발행 버튼 위에 보이고 버튼은 비활성. 서버(issueOffer)는 같은 규칙으로 다시 거부한다
  const holder = brand ? exclusiveHolder(offers, brand.id, new Date()) : null;
  const holderBrand = holder ? (Array.isArray(holder.brands) ? holder.brands[0] : holder.brands) : null;
  const failing = checks.filter((c) => c.required && !c.ok); // 권장 조건은 발행을 막지 않는다 (11-09 완화)
  const blockers = [
    ...(!["reviewed", "offering", "repool"].includes(p.status) ? [tk("issue.notIssuable")] : []),
    ...(failing.length ? [`${tk("issue.failingChecks")}: ${failing.map((c) => tk(`product.check.${c.key}`)).join(" · ")}`] : []),
    ...(!p.name_ko?.trim() ? [tk("review.error.needKo")] : []),
    ...(holder ? [tk("issue.blocked.exclusive", { brand: holderBrand?.name ?? "", date: fmtDay(holder.exclusive_until) })] : []),
  ];
  const issuable = blockers.length === 0;
  // 같은 브랜드에 살아 있는 제안이 걸린 항목("" = 추천) — 항목을 고르면 폼이 중복을 미리 막는다
  const liveItemKeys = offers.filter((o) => o.brand_id === brandId && isLive(o.status)).map((o) => o.request_item_id ?? "");

  return (
    <div>
      <BackLink href="/admin/offers" />
      <PageHeader eyebrow={[tk("entity.product"), p.code].filter(Boolean).join(" · ")} title={p.name_ko || p.name_zh || p.id.slice(0, 8)}
        actions={<Link href={`/admin/products/${p.id}`} className="link">{tk("issue.toReview")}</Link>}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StatusPill entity="product" status={p.status} />
        </div>
      </PageHeader>
      <DetailLayout
        main={
          <>
            {images.length > 0 && (
              <div className="mb-12 grid grid-cols-4 gap-6">{/* L12: 사진 1장 = 2칸 */}
                {images.slice(0, 4).map((i, n) => <Photo key={i.id} src={urls[i.storage_path]} label={n === 0 ? p.code : null} />)}
              </div>
            )}
            <Section title={tk("issue.history")} count={offers.length}>
              {offers.length === 0 ? <p className="text-body text-ink-2">{tk("issue.noHistory")}</p> : (
                <table className={TBL}>
                  <thead>
                    <tr>
                      <th>{tk("admin.requests.col.brand")}</th>
                      <th>{tk("issue.typeCol")}</th>
                      <th>{tk("admin.requests.col.status")}</th>
                      <th className="r">{tk("issue.exclusiveCol")}</th>
                      <th className="r">{tk("issue.issuedAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => {
                      const b = Array.isArray(o.brands) ? o.brands[0] : o.brands;
                      return (
                        <tr key={o.id} className={o.brand_id === brandId ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-ink [&>td:first-child]:pl-3" : ""}>
                          <td className="font-medium">{b?.name}</td>
                          <td className="text-meta text-ink-2">{tk(`issue.type.${o.type}`)}</td>
                          <td>
                            <span className={`st ${o.status === "declined" || o.status === "expired" ? "done" : o.status === "new" ? "wait" : ""}`}>{tk(`status.offer.${o.status}`)}</span>
                            {o.decline_reason && <span className="ml-2 text-meta text-ink-2">· {tk(`decline.${o.decline_reason}`)}</span>}
                          </td>
                          <td className="r text-meta text-ink-2">{o.exclusive_until ?? "-"}</td>
                          <td className="r text-meta text-muted">{fmtDate(o.issued_at)}</td>
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
          <Section title={tk("admin.offers.issueTitle")} tone={issuable ? undefined : "warn"}>
            <form className="mb-6 flex items-end gap-3">
              <label className="field flex-1"><span className="lbl">{tk("issue.brand")}</span>
                <select name="brand" defaultValue={brandId ?? ""}>
                  {!brandId && <option value="" disabled>{tk("issue.pickBrandFirst")}</option>}
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <button className="btn sec sm">{tk("admin.offers.pickBrand")}</button>
            </form>
            {brand && cost.tiers.length > 0 ? (
              <IssueForm
                key={brand.id}
                blockers={blockers}
                liveItemKeys={liveItemKeys}
                productId={p.id}
                brand={brand}
                items={items}
                defaultItemId={p.source_request_item_id}
                priorOfferCount={offers.length}
                costTiers={cost.tiers}
                weightG={p.weight_g ?? 0}
                labels={inh.labelOptions}
                mods={inh.modOptions}
                settings={{
                  fee_rate: settings.fee_rate, hidden_margin_rate: settings.hidden_margin_rate, fx_rate_cny_krw: settings.fx_rate_cny_krw,
                  sample_air_per_kg_krw: settings.sample_air_per_kg_krw, domestic_shipping_krw: settings.domestic_shipping_krw,
                  exclusive_days: settings.exclusive_days, offer_valid_days: settings.offer_valid_days, target_diff_pct: settings.target_diff_pct,
                }}
              />
            ) : (
              <div className="space-y-2">
                {brand ? <BlockedNote lines={blockers} /> : <p className="text-meta text-ink-2">{tk("issue.pickBrandFirst")}</p>}
                <button className="btn lg w-full" disabled>{tk("issue.submit")}</button>
              </div>
            )}
          </Section>
        }
      />
    </div>
  );
}
