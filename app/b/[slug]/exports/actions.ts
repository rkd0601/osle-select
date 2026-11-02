"use server";
// 참고: 서버 액션 파일은 async 함수만 export 가능 — 실행 시간 상한은 app/b/[slug]/exports/page.tsx 의 `export const maxDuration = 60` 로 (r7)
const MAX_EXPORT_PHOTOS = 120;
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAccess } from "@/lib/auth/guards";
import { listExportCandidates, loadExportSources } from "@/lib/db/brand/exports";
import { BUCKETS } from "@/lib/config";
import { buildPackage, packageZip, packageZipName, SHOP_TYPES } from "@/lib/exports";
import { toSalesJpg } from "@/lib/exports/images";
import { withImages } from "@/lib/exports/source";

/**
 * B-12 위아더 표준 패키지 만들기 (DECISIONS 9-5, docs/EXPORT_PACKAGE_SPEC.md v1): 후보(발주 확정·샘플 채택) 검증 →
 * 상품 정보(발주 확정 스냅샷 또는 브랜드 뷰) → 판매용 사진 내려받아 JPG 변환(실패 사진은 빼고 README에 목록) →
 * README·products/options/sizes.csv·상세 HTML (+ 고른 쇼핑몰 프리셋, 참고용) → 누출 검사 → zip
 * → Storage exports/{brand}/{package}/ (비공개) → export_packages 행. 서비스 롤은 사진 경로 읽기와 결과 쓰기에만 쓴다.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Input = z.object({
  productIds: z.array(z.guid()).min(1).max(30),
  presets: z.array(z.enum(SHOP_TYPES as [string, ...string[]])).max(SHOP_TYPES.length).default([]),
});

export async function createExportPackage(brandId: string, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = Input.safeParse(input);
  if (!z.guid().safeParse(brandId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const access = await requireBrandAccess(brandId);
  if (!access) return { ok: false, error: "common.notFound" };
  const presets = [...new Set(parsed.data.presets)] as (typeof SHOP_TYPES)[number][];
  const ids = [...new Set(parsed.data.productIds)];
  const allowed = new Set((await listExportCandidates(brandId)).map((c) => c.productId));
  if (ids.some((id) => !allowed.has(id))) return { ok: false, error: "common.notFound" };

  const sources = await loadExportSources(brandId, ids);
  if (sources.length !== ids.length) return { ok: false, error: "common.notFound" };
  // 패키지 크기 상한: 사진 120장(≈ 상품 30 × 4) — 버킷 50MiB·서버 액션 시간 안에서 끝나게 (r7 리뷰 2)
  const photoTotal = sources.reduce((n, s) => n + s.photoPaths.length, 0);
  if (photoTotal > MAX_EXPORT_PHOTOS) return { ok: false, error: "export.error.tooLarge" };
  const db = createAdminClient();
  const { data: brand } = await db.from("brands").select("slug").eq("id", brandId).maybeSingle();
  const today = new Date().toISOString().slice(0, 10);

  const { data: row, error } = await db
    .from("export_packages")
    .insert({ brand_id: brandId, product_ids: ids, shop_type: "osle", status: "building", created_by: access.actor.id })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "common.error" };
  const store = db.storage.from(BUCKETS.exports);
  const base = `${brandId}/${row.id}`;
  const zipPath = `${base}/${packageZipName(brand?.slug ?? "brand", today)}`;
  const csvPath = `${base}/products.csv`;
  let result: "ready" | "failed" | "leak" = "failed";
  let converted = 0;
  try {
    // 사진: 4장씩 병렬로 내려받아 JPG로. 상품별로 성공한 것만 순서대로 _01, _02… (01 = 대표)
    const jobs = sources.flatMap((s) => s.photoPaths.map((path) => ({ productId: s.productId, path })));
    const out: (Uint8Array | null)[] = [];
    for (let i = 0; i < jobs.length; i += 4) {
      out.push(...(await Promise.all(jobs.slice(i, i + 4).map(async (j) => {
        const { data } = await db.storage.from(BUCKETS.productImages).download(j.path);
        return data ? toSalesJpg(new Uint8Array(await data.arrayBuffer())) : null;
      }))));
    }
    const images: { name: string; bytes: Uint8Array }[] = [];
    const missing: { code: string; n: number }[] = [];
    const products = sources.map((s) => {
      const got = jobs.flatMap((j, k) => (j.productId === s.productId && out[k] ? [out[k]!] : []));
      const p = withImages(s, got.length);
      got.forEach((bytes, k) => images.push({ name: p.images[k], bytes }));
      if (got.length < s.photoPaths.length) missing.push({ code: s.base.code, n: s.photoPaths.length - got.length });
      return p;
    });
    converted = images.length;
    const pkg = buildPackage(products, { presets, missingPhotos: missing, date: today });
    if (pkg.leak) {
      result = "leak";
      await db.from("audit_logs").insert({ actor_id: access.actor.id, action: "export.leak_blocked", entity: "brand", entity_id: brandId, diff: { products: ids, presets } });
    } else {
      const [z1, z2] = await Promise.all([
        store.upload(zipPath, new Blob([packageZip(pkg, images) as BlobPart], { type: "application/zip" }), { contentType: "application/zip", upsert: true }),
        store.upload(csvPath, new Blob([pkg.productsCsv], { type: "text/csv;charset=utf-8" }), { contentType: "text/csv; charset=utf-8", upsert: true }),
      ]);
      result = !z1.error && !z2.error ? "ready" : "failed";
    }
  } catch {
    result = "failed";
  }
  const ok = result === "ready";
  await db.from("export_packages").update({
    status: ok ? "ready" : "failed",
    files: ok ? [{ kind: "zip", path: zipPath }, { kind: "csv", path: csvPath }] : [],
  }).eq("id", row.id);
  await db.from("audit_logs").insert({
    actor_id: access.actor.id, action: "export.create", entity: "export_package", entity_id: row.id,
    diff: { spec: "osle-v1", presets, products: ids.length, photos: converted, missing_photos: photoTotal - converted, result },
    on_behalf_of_brand_id: access.onBehalf ? brandId : null,
  });
  revalidatePath("/b/[slug]/exports", "page");
  if (result === "leak") return { ok: false, error: "export.error.leak" };
  return ok ? { ok: true, data: { id: row.id } } : { ok: false, error: "common.error" };
}
