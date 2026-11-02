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
  const fact = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-line py-1 text-meta"><span className="text-muted">{k}</span><span className="text-right">{v ?? "-"}</span></div>
  );
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <Link href="/admin/products" className="text-meta text-muted">{tk("common.back")}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-bold">{p.name_ko || p.name_zh || p.id.slice(0, 8)}</h1>
          <StatusPill entity="product" status={p.status} />
          {p.code && <span className="num text-meta text-muted">{p.code}</span>}
          <Link href={`/admin/offers/${p.id}`} className="text-meta text-signature">{tk("review.toIssue")} →</Link>
        </div>
        {p.status === "recheck" && p.recheck_reason && (
          <p className="bg-warn-soft px-3 py-2 text-meta text-warn">{tk("review.recheckFields")}: {p.recheck_reason.split(",").map((f: string) => tk(`product.field.${f}`)).join(" · ")}</p>
        )}
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
          {images.map((i) => (
            <figure key={i.id} className="text-micro text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
              <img src={urls[i.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
              <figcaption>{tk(`product.kind.${i.kind}`)} · {tk(`product.source.${i.source}`)}{i.usable_for_sales ? " · ✔" : ""}</figcaption>
            </figure>
          ))}
        </div>
        <section>
          {fact(tk("product.vendor"), vendor ? `${vendor.name}${vendor.booth ? ` · ${vendor.booth}` : ""}${vendor.trust_score != null ? ` · ${tk("admin.vendors.trust")} ${vendor.trust_score}` : ""}` : null)}
          {fact(tk("product.cost"), <span className="num">{cost.tiers.map((t) => `${t.min_qty}+ ¥${t.cost_cny}`).join(" / ")}</span>)}
          {fact(tk("product.detail.fabric"), `${(p.fabric ?? []).map((f: { material_code: string; pct: number }) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ")} (${fabricSum(p.fabric ?? [])}%)`)}
          {fact(tk("product.detail.care"), (p.care_codes ?? []).map((c: string) => label(CARE, c, "ko")).join(", "))}
          {fact(tk("product.detail.origin"), label(ORIGINS, p.origin ?? "", "ko"))}
          {fact(tk("product.detail.supplyType"), p.supply_type ? tk(`product.supply.${p.supply_type}`) : null)}
          {fact(tk("product.detail.leadDays"), p.lead_days)}
          {fact(tk("product.detail.productionMoq"), p.production_moq)}
          {fact(tk("product.detail.minQty"), p.min_qty)}
          {fact(tk("product.detail.weight"), p.weight_g)}
          {fact(tk("product.detail.hold"), inh.hold ? ("none" in inh.hold ? tk("product.detail.hold.none") : tk("product.detail.hold.deposit", { pct: Math.round(inh.hold.deposit_pct * 100), days: inh.hold.days })) : null)}
          {fact(tk("product.detail.sizes"), sizes.map((s) => s.label).join(" / "))}
          {fact(tk("product.detail.verifiedPlace"), p.verified_place)}
        </section>
        <section className="bg-surface p-3">
          <h2 className="text-meta font-semibold">{tk("product.detail.checklist")} <span className="num text-muted">{checks.filter((c) => c.ok).length}/{checks.length}</span></h2>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 text-meta">
            {checks.map((c) => <li key={c.key} className={c.ok ? "text-signature" : "text-warn"}>{c.ok ? "✔" : "○"} {tk(`product.check.${c.key}`)}</li>)}
          </ul>
        </section>
      </div>
      <ReviewPanel
        productId={p.id}
        status={p.status}
        zh={{ name: p.name_zh, desc: p.desc_zh, quality: p.quality_note_zh }}
        ko={{ name: p.name_ko, desc: p.desc_ko, quality: p.quality_note_ko, show: p.show_quality_note }}
        colors={colors}
        meta={p.translation_meta}
        checksOk={checks.every((c) => c.ok)}
        templates={templates.map((t) => ({ code: t.code, ko: t.ko }))}
      />
    </div>
  );
}
