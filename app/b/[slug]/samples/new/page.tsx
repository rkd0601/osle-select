import { requireBrandMember } from "@/lib/auth/session";
import { getBrandAddress, listSampleCandidates } from "@/lib/db/brand/samples";
import { getSettings } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { BackLink } from "../../_ui/list";
import { tk } from "@/lib/i18n";
import { SampleForm } from "./sample-form";
import { bySortOrder } from "@/lib/images/order";

/** B-06 샘플 요청서 (디자인 v2.2: 12칸 머리 8 → 잉크 룰 → 본문 8, 상품 코드 없음). ?offers=<id,id> 로 제안 상세 "샘플 요청하기"에서 들어온다. */
export default async function NewSamplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ offers?: string }> }) {
  const { slug } = await params;
  const { brand, member } = await requireBrandMember(slug);
  const { offers: pre } = await searchParams;
  const [data, settings, addr] = await Promise.all([listSampleCandidates(brand.id), getSettings(), getBrandAddress(brand.id)]);
  const cover = (pid: string) => {
    // 대표 사진 = CN 편집 화면 1번(sort_order, 동순위 id) — 3차 검증 T4
    const imgs = data.images.filter((i) => i.product_id === pid).sort(bySortOrder);
    return imgs[0]?.storage_path ?? null;
  };
  const urls = await signedReadUrls("productImages", data.offers.map((o) => cover(o.product_id)).filter(Boolean) as string[]);
  const candidates = data.offers.map((o) => {
    const p = data.products.find((x) => x.id === o.product_id);
    const img = cover(o.product_id);
    return {
      offerId: o.id, status: o.status, code: null, name: p?.name_ko ?? null, image: img ? urls[img] ?? null : null, productFee: o.sample_fee_product_krw,
      colors: data.colors.filter((c) => c.product_id === o.product_id).map((c) => ({ id: c.id, name: c.name_ko ?? "", hex: c.hex })),
      sizes: data.sizes.filter((s) => s.product_id === o.product_id).map((s) => ({ id: s.id, label: s.label })),
      variants: data.variants.filter((v) => v.product_id === o.product_id),
    };
  });
  const preselect = (pre ?? "").split(",").filter((id) => candidates.some((c) => c.offerId === id));
  return (
    <div className="g12">
      <div className="c12"><BackLink href={`/b/${slug}/progress`} label={tk("nav.progress")} /></div>
      <div className="c8">
        <h1 className="h1">{tk("sample.new.title")}</h1>
        <p className="lead mt-3">{tk("sample.new.lead")}</p>
      </div>
      <div className="c12 rule-ink" />
      <div className="c8 min-w-0">
        <SampleForm
          brandId={brand.id} slug={slug} candidates={candidates} preselect={preselect} qtyMax={settings.sample_qty_max} address={addr.address}
          canPurchase={member.level === "owner" || member.can_purchase}
        />
      </div>
    </div>
  );
}
