import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getMyProduct } from "@/lib/db/cn/products";
import { getRejectionTemplates } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { CARE, MATERIALS, ORIGINS, label } from "@/lib/codes";
import { fabricSum, resolveInherited } from "@/lib/products";
import { StatusPill } from "@/components/domain/status-pill";
import { tk } from "@/lib/i18n/admin";
import { PageHeader } from "@/components/domain/page-header";
import { Photo } from "@/components/domain/photo";
import { Figure } from "@/components/domain/figure";
import { BackLink, DetailLayout, Facts, Section } from "../../_ui/ui";
import { ReviewPanel } from "./review-panel";

/**
 * A-03 상품 검수 (품질만). 좌: 사진·사실 정보(원가·원청 포함, 관리자 전용) / 우: 원문·번역·공개 조건·결정.
 * 가격·브랜드는 A-04에서. 재확인 건은 변경 필드(recheck_reason)를 위에 띄운다.
 */
export default async function AdminProductReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const u = await requireRole(["ADMIN"], "/admin/products");
  const data = await getMyProduct({ id: u.id, role: u.role }, id);
  if (!data) notFound();
  const { product: p, cost, images, colors, sizes, vendor, checks } = data;
  const [urls, templates] = await Promise.all([signedReadUrls("productImages", images.map((i) => i.storage_path)), getRejectionTemplates()]);
  const inh = resolveInherited(p, vendor);
  const required = checks.filter((c) => c.required); // 필수만 막는다 — 권장 미충족은 표시만 (11-09 완화)
  const okCount = required.filter((c) => c.ok).length;
  const holdText = inh.hold ? ("none" in inh.hold ? tk("product.detail.hold.none") : tk("product.detail.hold.deposit", { pct: Math.round(inh.hold.deposit_pct * 100), days: inh.hold.days })) : null;
  return (
    <div>
      <BackLink href="/admin/products" />
      <PageHeader eyebrow={[tk("entity.product"), p.code, p.category].filter(Boolean).join(" · ")} title={p.name_ko || p.name_zh || p.id.slice(0, 8)}
        actions={<Link href={`/admin/offers/${p.id}`} className="link">{tk("review.toIssue")}</Link>}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StatusPill entity="product" status={p.status} />
          {vendor && <span className="text-meta text-ink-2">{vendor.name}{vendor.booth ? ` · ${vendor.booth}` : ""}</span>}
        </div>
      </PageHeader>
      {p.status === "recheck" && p.recheck_reason && (
        <p className="mb-10 border-l-2 border-l-warn py-1 pl-5 text-body text-warn">{tk("review.recheckFields")}: {p.recheck_reason.split(",").map((f: string) => tk(`product.field.${f}`)).join(" · ")}</p>
      )}
      <DetailLayout
        main={
          <>
            {images.length > 0 && (
              <Section title={tk("admin.product.photos")} count={images.length}>
                <div className="grid grid-cols-3 gap-x-4 gap-y-6 lg:grid-cols-4 2xl:grid-cols-6">
                  {images.map((i) => (
                    <figure key={i.id} className="text-caption text-ink-2">
                      <Photo src={urls[i.storage_path]} />
                      <figcaption className="mt-2">{tk(`product.kind.${i.kind}`)} · {tk(`product.source.${i.source}`)}{i.usable_for_sales && <span className="st done ml-2">{tk("admin.product.forSales")}</span>}</figcaption>
                    </figure>
                  ))}
                </div>
              </Section>
            )}
            <Section title={tk("admin.product.review")}>
              <ReviewPanel
                productId={p.id}
                status={p.status}
                zh={{ name: p.name_zh, desc: p.desc_zh, quality: p.quality_note_zh }}
                ko={{ name: p.name_ko, desc: p.desc_ko, quality: p.quality_note_ko, show: p.show_quality_note }}
                colors={colors}
                meta={p.translation_meta}
                checksOk={required.every((c) => c.ok)}
                templates={templates.map((t) => ({ code: t.code, ko: t.ko }))}
              />
            </Section>
          </>
        }
        aside={
          <>
            <Figure first label={tk("product.detail.checklist")} value={<>{okCount}<span className="ml-1 text-[0.5em] text-muted">/ {required.length}</span></>} />
            {[true, false].map((req) => (
              <div key={String(req)}>
                <p className="mt-5 text-caption text-muted">{tk(req ? "product.check.required" : "product.check.recommended")}</p>
                <ul>
                  {checks.filter((c) => c.required === req).map((c) => (
                    <li key={c.key} className="border-b border-line py-2">
                      <span className={`st ${c.ok ? "done" : req ? "warn" : "wait"}`}>{tk(`product.check.${c.key}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="pt-12">
            <Section title={tk("admin.product.facts")}>
              <Facts rows={[
                [tk("product.vendor"), vendor ? `${vendor.name}${vendor.booth ? ` · ${vendor.booth}` : ""}${vendor.trust_score != null ? ` · ${tk("admin.vendors.trust")} ${vendor.trust_score}` : ""}` : null],
                [tk("product.cost"), <span key="c" className="num">{cost.tiers.map((t) => `${t.min_qty}+ ¥${t.cost_cny}`).join(" / ")}</span>],
                [tk("product.detail.fabric"), `${(p.fabric ?? []).map((f: { material_code: string; pct: number }) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ")} (${fabricSum(p.fabric ?? [])}%)`],
                [tk("product.detail.care"), (p.care_codes ?? []).map((c: string) => label(CARE, c, "ko")).join(", ")],
                [tk("product.detail.origin"), label(ORIGINS, p.origin ?? "", "ko")],
                [tk("product.detail.supplyType"), p.supply_type ? tk(`product.supply.${p.supply_type}`) : null],
                [tk("product.detail.leadDays"), p.lead_days != null ? <span key="l" className="num">{p.lead_days}</span> : null],
                [tk("product.detail.productionMoq"), p.production_moq != null ? <span key="m" className="num">{p.production_moq}</span> : null],
                [tk("product.detail.minQty"), p.min_qty != null ? <span key="q" className="num">{p.min_qty}</span> : null],
                [tk("product.detail.weight"), p.weight_g != null ? <span key="w" className="num">{p.weight_g}</span> : null],
                [tk("product.detail.hold"), holdText],
                [tk("product.detail.sizes"), sizes.map((s) => s.label).join(" / ")],
                [tk("product.detail.verifiedPlace"), p.verified_place],
              ]} />
            </Section>
            </div>
          </>
        }
      />
    </div>
  );
}
