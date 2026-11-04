import { requireBrandMember } from "@/lib/auth/session";
import { listBrandOffers } from "@/lib/db/brand/offers";
import { signedReadUrls } from "@/lib/storage";
import { MATERIALS, label } from "@/lib/codes";
import { supplyPriceKrw } from "@/lib/pricing";
import { krw, fmtDay } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { SERVICE } from "@/lib/config";
import { PrintButton } from "./print-button";
import { bySortOrder } from "@/lib/images/order";

/**
 * 라인시트 PDF (B-04): 인쇄용 화면 + 브라우저 "PDF로 저장". 외부 PDF 라이브러리 없음.
 * 열: 이미지 · 상품명 · 컬러 · 사이즈 · 상품가 · 수수료 · 공급가 · 혼용률. 디자인 v2.2: 12칸 그리드(머리 8+4 → 잉크 룰 → 표 12), 상품 코드·눈썹 없음(d-11), 날짜 "11월 18일".
 */
export default async function LinesheetPrint({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const data = await listBrandOffers(brand.id);
  const live = data.offers.filter((o) => o.status !== "expired" && o.status !== "declined");
  const cover = (pid: string) => {
    // 대표 사진 = CN 편집 화면 1번(sort_order, 동순위 id) — 3차 검증 T4
    const imgs = data.images.filter((i) => i.product_id === pid).sort(bySortOrder);
    return imgs[0]?.storage_path ?? null;
  };
  const urls = await signedReadUrls("productImages", live.map((o) => cover(o.product_id)).filter(Boolean) as string[]);
  return (
    <div className="g12 print:block">
      <style>{`@media print { header, nav { display: none !important } main.page { padding: 0 !important } @page { size: A4 landscape; margin: 12mm } }`}</style>
      <div className="c8">
        <p className="meta">{SERVICE.name} · {brand.name} · {fmtDay(new Date())}</p>
        <h1 className="h1 mt-2">{tk("linesheet.title")}<span className="num thin ml-3">{live.length}</span></h1>
      </div>
      <div className="c4 tr"><PrintButton /></div>
      <div className="c12 rule-ink print:my-3" />
      <div className="c12 min-w-0 max-w-full overflow-x-auto print:overflow-visible">
      <table className="w-full text-caption">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="w-16 py-1" /><th>{tk("print.name")}</th><th>{tk("product.detail.colors")}</th><th>{tk("product.detail.sizes")}</th>
            <th className="text-right">{tk("price.product")}</th><th className="text-right">{tk("print.fee")}</th><th className="text-right">{tk("price.supply")}</th><th>{tk("product.detail.fabric")}</th>
          </tr>
        </thead>
        <tbody>
          {live.map((o) => {
            const p = data.products.find((x) => x.id === o.product_id);
            if (!p) return null;
            const t = [...o.price_tiers].sort((a, b) => a.min_qty - b.min_qty)[0];
            const s = supplyPriceKrw(t.product_price_krw, o.fee_rate);
            const img = cover(o.product_id);
            return (
              <tr key={o.id} className="break-inside-avoid border-b border-line align-top">
                <td className="py-1.5 pr-2">{img && urls[img] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                  <img src={urls[img]} alt="" className="aspect-[3/4] w-14 object-cover" />
                ) : null}</td>
                <td className="pr-2 font-medium">{p.name_ko}</td>
                <td className="pr-2">{data.colors.filter((c) => c.product_id === p.id).map((c) => c.name_ko).join(" / ")}</td>
                <td className="pr-2">{data.sizes.filter((x) => x.product_id === p.id).map((x) => x.label).join(" / ")}</td>
                <td className="num pr-2 text-right">₩{krw(t.product_price_krw)}</td>
                <td className="num pr-2 text-right">{Math.round(o.fee_rate * 100)}%</td>
                <td className="num pr-2 text-right font-medium">₩{krw(s)}</td>
                <td>{(p.fabric ?? []).map((f: { material_code: string; pct: number }) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-muted">{tk("price.logisticsSeparate")}</p>
      </div>
    </div>
  );
}
