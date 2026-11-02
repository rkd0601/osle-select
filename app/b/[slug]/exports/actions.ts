"use server";
// 참고: 서버 액션 파일은 async 함수만 export 가능 — 실행 시간 상한은 app/b/[slug]/exports/page.tsx 의 `export const maxDuration = 60` 로 (r7)
const MAX_EXPORT_PHOTOS = 120;
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess } from "@/lib/auth/guards";
import { listExportCandidates, loadExportProducts } from "@/lib/db/brand/exports";
import { BUCKETS } from "@/lib/config";
import { buildPackage, packageZip, SHOP_TYPES } from "@/lib/exports";

/**
 * B-12 쇼핑몰 패키지 만들기: 후보(발주 확정·샘플 채택) 검증 → 브랜드 뷰로 상품 정보 → CSV·상세 HTML → 판매 가능 사진 → zip
 * → Storage exports/{brand}/{package}/ (비공개) → export_packages 행. 상품 데이터는 브랜드 세션 뷰에서만 오고,
 * 서비스 롤은 그 뷰가 돌려준 사진 경로를 읽고 결과를 쓰는 데만 쓴다. 산출물은 한 번 더 누출 검사.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Input = z.object({ productIds: z.array(z.guid()).min(1).max(30), shop: z.enum(SHOP_TYPES as [string, ...string[]]) });

export async function createExportPackage(brandId: string, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = Input.safeParse(input);
  if (!z.guid().safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const shop = parsed.data.shop as (typeof SHOP_TYPES)[number];
  const ids = [...new Set(parsed.data.productIds)];
  const allowed = new Set((await listExportCandidates(brandId)).map((c) => c.productId));
  if (ids.some((id) => !allowed.has(id))) return { ok: false, error: "common.notFound" };

  const { products, photos } = await loadExportProducts(ids);
  if (products.length !== ids.length) return { ok: false, error: "common.notFound" };
  // 패키지 크기 상한: 사진 120장(≈ 상품 30 × 4) — 버킷 50MiB·서버 액션 시간 안에서 끝나게 (r7 리뷰 2)
  if (photos.length > MAX_EXPORT_PHOTOS) return { ok: false, error: "export.error.tooLarge" };
  const pkg = buildPackage(shop, products);
  const db = createAdminClient();
  if (pkg.leak) {
    await db.from("audit_logs").insert({ actor_id: access.actor.id, action: "export.leak_blocked", entity: "brand", entity_id: brandId, diff: { shop, products: ids } });
    return { ok: false, error: "export.error.leak" };
  }

  const { data: row, error } = await db
    .from("export_packages")
    .insert({ brand_id: brandId, product_ids: ids, shop_type: shop, status: "building", created_by: access.actor.id })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "common.error" };
  const store = db.storage.from(BUCKETS.exports);
  const images: { name: string; bytes: Uint8Array }[] = [];
  const base = `${brandId}/${row.id}`;
  const zipPath = `${base}/${shop}_package.zip`;
  const csvPath = `${base}/${pkg.csvName}`;
  let ok = false;
  try {
    // 사진은 4장씩 병렬로 내려받는다
    for (let i = 0; i < photos.length; i += 4) {
      const chunk = await Promise.all(photos.slice(i, i + 4).map(async (ph) => {
        const { data } = await db.storage.from(BUCKETS.productImages).download(ph.path);
        return data ? { name: ph.name, bytes: new Uint8Array(await data.arrayBuffer()) } : null;
      }));
      for (const c of chunk) if (c) images.push(c);
    }
    const [z1, z2] = await Promise.all([
      store.upload(zipPath, new Blob([packageZip(pkg, images) as BlobPart], { type: "application/zip" }), { contentType: "application/zip", upsert: true }),
      store.upload(csvPath, new Blob([pkg.csv], { type: "text/csv;charset=utf-8" }), { contentType: "text/csv; charset=utf-8", upsert: true }),
    ]);
    ok = !z1.error && !z2.error;
  } catch {
    ok = false;
  }
  await db.from("export_packages").update({
    status: ok ? "ready" : "failed",
    files: ok ? [{ kind: "zip", path: zipPath }, { kind: "csv", path: csvPath }] : [],
  }).eq("id", row.id);
  await db.from("audit_logs").insert({
    actor_id: access.actor.id, action: "export.create", entity: "export_package", entity_id: row.id,
    diff: { shop, products: ids.length, photos: images.length, missing_photos: photos.length - images.length, version: pkg.version },
    on_behalf_of_brand_id: access.onBehalf ? brandId : null,
  });
  revalidatePath("/b/[slug]/exports", "page");
  return ok ? { ok: true, data: { id: row.id } } : { ok: false, error: "common.error" };
}
