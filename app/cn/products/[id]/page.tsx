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
import { PageHeader } from "@/components/domain/page-header";
import { t } from "@/lib/i18n/cn";
import { BasicBlock, Checklist, ColorsSizesBlock, InheritBlock, MaterialBlock, PhotosBlock, SupplyBlock } from "./editor";
import { BLOCK_IDS } from "./block-ids";

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
  const data = await getMyProduct(actor, id, { allowVendorRead: true });
  if (!data) notFound();
  const { product: p, cost, images, colors, sizes, vendor, checks, readOnly } = data;
  const [urls, categories, vendors, templates] = await Promise.all([
    signedReadUrls("productImages", images.map((i) => i.storage_path)),
    getCategories(),
    listRecentVendors(actor, 30),
    getRejectionTemplates(),
  ]);
  const vendorOptions = vendor && !vendors.some((v) => v.id === vendor.id) ? [{ id: vendor.id, name: vendor.name, booth: vendor.booth }, ...vendors] : vendors;
  const locked = readOnly || !isEditableByCn(p.status); // 원청 계정이 보는 소싱 담당 등록 상품은 읽기 전용 (u-12, 서버 액션도 created_by로 거부)
  const canSubmit = !readOnly && allowedNext("product", p.status, u.role).includes("pending_review");
  const reason = (code: string) => templates.find((x) => x.code === code)?.[L === "ko" ? "ko" : "zh"] ?? code;

  const done = checks.filter((c) => c.ok).length;
  const allOk = done === checks.length;
  const jump: [string, string][] = [
    [BLOCK_IDS.photos, "product.detail.photos"], [BLOCK_IDS.basic, "product.detail.basic"], [BLOCK_IDS.colorsSizes, "product.detail.colorsSizes"],
    [BLOCK_IDS.material, "product.detail.material"], [BLOCK_IDS.supply, "product.detail.supply"], [BLOCK_IDS.inherit, "product.detail.inherit"],
  ];

  return (
    <div className="pb-24 lg:pb-0">
      <Link href="/cn/products" className="inline-flex min-h-10 items-center text-meta text-ink-2 hover:text-ink">{t(L, "common.back")}</Link>
      <PageHeader
        eyebrow={p.code ?? undefined}
        title={p.name_zh || p.code || p.id.slice(0, 8)}
        actions={<><StatusPill entity="product" status={p.status} locale={L} />{readOnly && <span className="inline-flex rounded-full bg-sand px-2.5 py-0.5 text-caption font-medium text-ink-2">{t(L, "product.readOnly.badge")}</span>}</>}
      >
        <div className="space-y-2">
          {readOnly ? <p className="rounded-ui border border-line bg-sand px-3 py-2 text-meta text-ink">{t(L, "product.readOnly.notice")}</p>
            : locked && <p className="rounded-ui border border-line bg-sand px-3 py-2 text-meta text-ink">{t(L, "product.detail.locked")}</p>}
          {p.status === "rejected" && p.rejected_reasons?.length > 0 && (
            <p className="rounded-ui border-l-2 border-warn bg-warn-soft px-3 py-2 text-body text-warn">{t(L, "product.list.rejected")}: {p.rejected_reasons.map(reason).join(" · ")}</p>
          )}
          <nav aria-label={t(L, "cn.detail.jump")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {jump.map(([id, key]) => <a key={id} href={`#${id}`} className="chip min-h-10 shrink-0">{t(L, key)}</a>)}
          </nav>
        </div>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
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
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Checklist L={L} vendor={u.role === "CN_VENDOR"} productId={p.id} checks={checks} canSubmit={canSubmit} />
        </aside>
      </div>
      {/* 모바일: 공개 조건 진행 하단 바 → 체크리스트(검수 요청 버튼)로 */}
      <a href={`#${BLOCK_IDS.checklist}`} className="fixed inset-x-0 bottom-0 z-10 flex min-h-14 items-center justify-between gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <span className="min-w-0">
          <span className={`num block text-body font-semibold ${allOk ? "text-signature" : "text-ink"}`}>{t(L, "cn.detail.progress", { ok: done, n: checks.length })}</span>
          {allOk && canSubmit && <span className="block text-caption text-signature">{t(L, "cn.detail.allOk")}</span>}
        </span>
        <span className="btn btn-secondary btn-sm min-h-10 shrink-0">{t(L, "cn.detail.viewChecklist")} ↓</span>
      </a>
    </div>
  );
}
