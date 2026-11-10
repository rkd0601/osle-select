import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { countProductOffers, getItemBriefForProduct, getMyProduct, listRecentVendors } from "@/lib/db/cn/products";
import { getCategories, getRejectionTemplates } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { canDeleteProduct, isEditableByCn, isPublished } from "@/lib/products";
import { StatusPill } from "@/components/domain/status-pill";
import { PageHeader } from "@/components/domain/page-header";
import { t } from "@/lib/i18n/cn";
import { BasicBlock, Checklist, ColorsSizesBlock, DeleteProduct, SubmitReviewButton, InheritBlock, MaterialBlock, PhotosBlock, SupplyBlock } from "./editor";
import { BLOCK_IDS } from "./block-ids";

/**
 * C-03 상품 상세 입력. 본인 상품만(ADMIN 전체), 아니면 404. 공개 조건 체크리스트는 서버가 계산한 값.
 * 원청 기본값 상속: 라벨·수정·홀딩은 예외만 입력 (기획서 F3).
 * 디자인 v2: 760 한 칸, 블록 = 룰로 나눈 섹션(카드·그림자 없음), 체크리스트는 맨 아래 + 하단 고정 바(진행 숫자 → 체크리스트).
 */
export default async function CnProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/products");
  const L = u.locale;
  const actor = { id: u.id, role: u.role };
  const data = await getMyProduct(actor, id, { allowVendorRead: true });
  if (!data) notFound();
  const { product: p, cost, images, colors, sizes, vendor, checks, readOnly } = data;
  const [urls, categories, vendors, templates, item, offerCount] = await Promise.all([
    signedReadUrls("productImages", images.map((i) => i.storage_path)),
    getCategories(),
    listRecentVendors(actor, 30),
    getRejectionTemplates(),
    getItemBriefForProduct(actor, p.source_request_item_id ?? null),
    countProductOffers(actor, p.id),
  ]);
  const vendorOptions = vendor && !vendors.some((v) => v.id === vendor.id) ? [{ id: vendor.id, name: vendor.name, booth: vendor.booth }, ...vendors] : vendors;
  const locked = readOnly || !isEditableByCn(p.status); // 원청 계정이 보는 소싱 담당 등록 상품은 읽기 전용 (u-12, 서버 액션도 created_by로 거부)
  const canSubmit = !readOnly && allowedNext("product", p.status, u.role).includes("pending_review");
  const reason = (code: string) => templates.find((x) => x.code === code)?.[L === "ko" ? "ko" : "zh"] ?? code;

  const required = checks.filter((c) => c.required); // 진행 표시는 필수 조건만 (권장은 막지 않는다)
  const done = required.filter((c) => c.ok).length;
  const allOk = done === required.length;
  const jump: [string, string][] = [
    [BLOCK_IDS.photos, "product.detail.photos"], [BLOCK_IDS.basic, "product.detail.basic"], [BLOCK_IDS.colorsSizes, "product.detail.colorsSizes"],
    [BLOCK_IDS.material, "product.detail.material"], [BLOCK_IDS.supply, "product.detail.supply"], [BLOCK_IDS.inherit, "product.detail.inherit"],
    [BLOCK_IDS.checklist, "product.detail.checklist"],
  ];

  return (
    <div className="pb-24">
      <Link href="/cn/products" className="-mt-2 mb-2 inline-flex min-h-10 items-center text-meta text-ink-2 hover:text-ink">{t(L, "common.back")}</Link>
      <PageHeader
        eyebrow={p.code ?? undefined}
        title={p.name_zh || item?.description_zh || p.code || p.id.slice(0, 8)}
        actions={<><StatusPill entity="product" status={p.status} locale={L} />{readOnly && <span className="chip">{t(L, "product.readOnly.badge")}</span>}</>}
      >
        {saved === "1" && (
          <p role="status" className="border-l-2 border-ok pl-3 text-body text-ink">{item ? t(L, "product.savedHeadItem", { seq: item.seq }) : t(L, "product.savedHead")}</p>
        )}
        {(readOnly || locked) && <p className="text-meta text-ink-2">{t(L, readOnly ? "product.readOnly.notice" : "product.detail.locked")}</p>}
        {p.status === "rejected" && p.rejected_reasons?.length > 0 && (
          <p className="mt-2 border-l-2 border-warn pl-3 text-body text-warn">{t(L, "product.list.rejected")}: {p.rejected_reasons.map(reason).join(" · ")}</p>
        )}
        <nav aria-label={t(L, "cn.detail.jump")} className="-mx-5 mt-3 flex gap-6 overflow-x-auto px-5 text-meta sm:mx-0 sm:flex-wrap sm:gap-y-0 sm:px-0">
          {jump.map(([id, key]) => <a key={id} href={`#${id}`} className="inline-flex min-h-10 shrink-0 items-center text-ink-2 hover:text-ink">{t(L, key)}</a>)}
        </nav>
      </PageHeader>

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
      <Checklist L={L} vendor={u.role === "CN_VENDOR"} productId={p.id} checks={checks} canSubmit={canSubmit} />
      {!readOnly && canDeleteProduct(p.status, offerCount) && <DeleteProduct L={L} productId={p.id} />}

      {/* 하단 고정 바: 공개 조건 진행 → 체크리스트(검수 요청 버튼)로 */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex min-h-14 max-w-[760px] items-center justify-between gap-4 px-5 py-2">
          <a href={`#${BLOCK_IDS.checklist}`} className="min-w-0">
            <span className="num block text-body text-ink">{t(L, "cn.detail.progress", { ok: done, n: required.length })}</span>
            {allOk && canSubmit && <span className="block truncate text-caption text-ok">{t(L, "cn.detail.allOk")}</span>}
          </a>
          {/* P1: 필수 다 차면 바로 검수 요청, 아니면 체크리스트로 */}
          {allOk && canSubmit
            ? <SubmitReviewButton L={L} productId={p.id} />
            : <a href={`#${BLOCK_IDS.checklist}`} className="btn sec sm min-h-10 shrink-0">{t(L, "cn.detail.viewChecklist")}</a>}
        </div>
      </div>
    </div>
  );
}
