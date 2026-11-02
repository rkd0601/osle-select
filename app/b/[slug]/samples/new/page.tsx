import { requireBrandMember } from "@/lib/auth/session";
import { getBrandAddress, listSampleCandidates } from "@/lib/db/brand/samples";
import { getSettings } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { tk } from "@/lib/i18n";
import { SampleForm } from "./sample-form";

/** B-06 샘플 요청서. ?offers=<id,id> 로 B-05 "샘플 요청서에 담기"에서 들어온다. */
export default async function NewSamplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ offers?: string }> }) {
  const { slug } = await params;
  const { brand, member } = await requireBrandMember(slug);
  const { offers: pre } = await searchParams;
  const [data, settings, addr] = await Promise.all([listSampleCandidates(brand.id), getSettings(), getBrandAddress(brand.id)]);
  const cover = (pid: string) => {
    const imgs = data.images.filter((i) => i.product_id === pid);
    return (imgs.find((i) => i.kind === "real") ?? imgs[0])?.storage_path ?? null;
  };
  const urls = await signedReadUrls("productImages", data.offers.map((o) => cover(o.product_id)).filter(Boolean) as string[]);
  const candidates = data.offers.map((o) => {
    const p = data.products.find((x) => x.id === o.product_id);
    const img = cover(o.product_id);
    return {
      offerId: o.id, status: o.status, code: p?.code ?? null, name: p?.name_ko ?? null, image: img ? urls[img] ?? null : null, productFee: o.sample_fee_product_krw,
      colors: data.colors.filter((c) => c.product_id === o.product_id).map((c) => ({ id: c.id, name: c.name_ko ?? "", hex: c.hex })),
      sizes: data.sizes.filter((s) => s.product_id === o.product_id).map((s) => ({ id: s.id, label: s.label })),
      variants: data.variants.filter((v) => v.product_id === o.product_id),
    };
  });
  const preselect = (pre ?? "").split(",").filter((id) => candidates.some((c) => c.offerId === id));
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-title-l font-bold tracking-tight">{tk("sample.new.title")}</h1>
      <p className="mt-2 text-lead text-ink-2">{tk("sample.new.lead")}</p>
      <div className="mt-8">
        <SampleForm
          brandId={brand.id} slug={slug} candidates={candidates} preselect={preselect} qtyMax={settings.sample_qty_max} address={addr.address}
          canPurchase={member.level === "owner" || member.can_purchase}
        />
      </div>
    </div>
  );
}
