import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getMyProduct, listRecentVendors } from "@/lib/db/cn/products";
import { getCategories, getRejectionTemplates } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { isEditableByCn, isPublished } from "@/lib/products";
import { StatusPill } from "@/components/domain/status-pill";
import { t } from "@/lib/i18n/cn";
import { BasicBlock, Checklist, ColorsSizesBlock, InheritBlock, MaterialBlock, PhotosBlock, SupplyBlock } from "./editor";

/**
 * C-03 상품 상세 입력 (PC). 본인 상품만(ADMIN 전체), 아니면 404. 공개 조건 체크리스트는 서버가 계산한 값.
 * 원청 기본값 상속: 라벨·수정·홀딩은 예외만 입력 (기획서 F3).
 */
export default async function CnProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/products");
  const L = u.locale;
  const actor = { id: u.id, role: u.role };
  const data = await getMyProduct(actor, id);
  if (!data) notFound();
  const { product: p, cost, images, colors, sizes, vendor, checks } = data;
  const [urls, categories, vendors, templates] = await Promise.all([
    signedReadUrls("productImages", images.map((i) => i.storage_path)),
    getCategories(),
    listRecentVendors(actor, 30),
    getRejectionTemplates(),
  ]);
  const vendorOptions = vendor && !vendors.some((v) => v.id === vendor.id) ? [{ id: vendor.id, name: vendor.name, booth: vendor.booth }, ...vendors] : vendors;
  const locked = !isEditableByCn(p.status);
  const canSubmit = allowedNext("product", p.status, u.role).includes("pending_review");
  const reason = (code: string) => templates.find((x) => x.code === code)?.[L === "ko" ? "ko" : "zh"] ?? code;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-8">
        <div>
          <Link href="/cn/products" className="text-meta text-muted">{t(L, "common.back")}</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-h2 font-bold">{p.name_zh || p.code || p.id.slice(0, 8)}</h1>
            <StatusPill entity="product" status={p.status} locale={L} />
            {p.code && <span className="num text-meta text-muted">{p.code}</span>}
          </div>
          {locked && <p className="mt-2 bg-sand px-3 py-2 text-meta">{t(L, "product.detail.locked")}</p>}
          {p.status === "rejected" && p.rejected_reasons?.length > 0 && (
            <p className="mt-2 border-l-2 border-warn pl-3 text-body text-warn">{t(L, "product.list.rejected")}: {p.rejected_reasons.map(reason).join(" · ")}</p>
          )}
        </div>
        {/* key: 저장 후 refresh로 서버 id가 생기면 블록 상태를 다시 맞춘다 (리뷰 5) */}
        <PhotosBlock key={images.map((i) => `${i.id}:${i.sort_order}`).join()} L={L} productId={p.id} locked={locked} images={images} urls={urls} colors={colors} />
        <BasicBlock L={L} productId={p.id} locked={locked} categories={categories} vendors={vendorOptions} p={p} />
        <ColorsSizesBlock key={[...colors, ...sizes].map((x) => x.id).join()} L={L} productId={p.id} locked={locked} category={p.category} colors={colors} sizes={sizes} />
        <MaterialBlock L={L} productId={p.id} locked={locked} fabric={p.fabric ?? []} origin={p.origin} care={p.care_codes ?? []} />
        <SupplyBlock L={L} vendor={u.role === "CN_VENDOR"} productId={p.id} locked={locked} published={isPublished(p.status)} tiers={cost.tiers} p={p} />
        <InheritBlock
          L={L}
          productId={p.id}
          locked={locked}
          vendor={vendor && { default_hold: vendor.default_hold, default_label_options: vendor.default_label_options, default_mod_options: vendor.default_mod_options }}
          overrides={{ hold: p.hold_override, labels: p.label_options_override, mods: p.mod_options_override }}
        />
      </div>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Checklist L={L} vendor={u.role === "CN_VENDOR"} productId={p.id} checks={checks} canSubmit={canSubmit} />
      </aside>
    </div>
  );
}
