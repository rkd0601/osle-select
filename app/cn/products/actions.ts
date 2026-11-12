"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCn, type Actor } from "@/lib/auth/guards";
import { applyTransition } from "@/lib/db/transition";
import { getSettings } from "@/lib/db/settings";
import { getMyProduct } from "@/lib/db/cn/products";
import { ownerAndDue } from "@/lib/sla";
import { notify } from "@/lib/notify";
import { pathsExist, proxyUpload, signedUploadUrl } from "@/lib/storage";
import { isAcceptedPhotoType } from "@/lib/images/resize";
import { canRequestReview } from "@/lib/transitions";
import {
  COLUMN_FIELD, ColorInput, canDeleteProduct, ImageMetaInput, ProductDetailInput, QuickProductInput, SizeInput, changedColumns, isEditableByCn, isOwnProductImagePath,
  isOwnVendorCardPath, isPublished, measurementErrors, normalizeTiers, productImagePath, productPublishChecks, publishedEditError, recheckReason, syncVariants, tiersEqual, vendorCardPath,
} from "@/lib/products";

/**
 * C-02·C-03·C-04 상품 등록 서버 액션. 쓰기는 전부 서비스 롤(0012) — 여기서 역할·소유·상태를 검증한다.
 * 원가는 product_costs에만 저장하고, 번역 API로 보내지 않는다(CLAUDE.md 규칙 11).
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();
const revalidate = (id?: string) => {
  revalidatePath("/cn/products", "page");
  if (id) revalidatePath("/cn/products/[id]", "page");
};

/** 내 상품(또는 ADMIN) + 편집 가능 상태 */
async function loadOwn(actor: Actor, productId: string) {
  let q = createAdminClient().from("products").select("id, status, created_by, vendor_id").eq("id", productId);
  if (actor.role !== "ADMIN") q = q.eq("created_by", actor.id);
  const { data } = await q.maybeSingle();
  return data;
}
/** 사진 경로 prefix의 주인: 상품 등록자 */
const ownerOf = (actor: Actor, product: { created_by: string | null } | null) => product?.created_by ?? actor.id;

// ---------- 업로드 ----------
/** 상품 사진 서명 업로드 URL. 상품이 아직 없으면(C-02 오프라인 등록) 클라이언트가 만든 id로 발급한다. */
export async function issueProductImageUploads(productId: string, count: number): Promise<Result<{ path: string; token: string }[]>> {
  if (!Id.safeParse(productId).success || !Number.isInteger(count) || count < 1 || count > 15) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  const { data: existing } = await createAdminClient().from("products").select("id, created_by").eq("id", productId).maybeSingle();
  if (existing && actor.role !== "ADMIN" && existing.created_by !== actor.id) return { ok: false, error: "common.notFound" };
  const owner = ownerOf(actor, existing);
  const out: { path: string; token: string }[] = [];
  for (let i = 0; i < count; i++) {
    const s = await signedUploadUrl("productImages", productImagePath(owner, productId, randomUUID()));
    if (!s) return { ok: false, error: "upload.failed" };
    out.push(s);
  }
  return { ok: true, data: out };
}

/** 서명 URL 업로드 실패 시 프록시 업로드 (product-images 또는 vendor-cards) */
export async function proxyCnImageUpload(form: FormData): Promise<Result<{ path: string }>> {
  const productId = String(form.get("productId") ?? "");
  const kind = String(form.get("kind") ?? "product");
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size > 5 * 1024 * 1024 || !isAcceptedPhotoType(file.type)) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  if (kind === "vendor") {
    const path = vendorCardPath(actor.id, randomUUID());
    return (await proxyUpload("vendorCards", path, file)) ? { ok: true, data: { path } } : { ok: false, error: "upload.failed" };
  }
  if (!Id.safeParse(productId).success) return { ok: false, error: "common.invalid" };
  const { data: existing } = await createAdminClient().from("products").select("id, created_by").eq("id", productId).maybeSingle();
  if (existing && actor.role !== "ADMIN" && existing.created_by !== actor.id) return { ok: false, error: "common.notFound" };
  const path = productImagePath(ownerOf(actor, existing), productId, randomUUID());
  return (await proxyUpload("productImages", path, file)) ? { ok: true, data: { path } } : { ok: false, error: "upload.failed" };
}

export async function issueVendorCardUpload(): Promise<Result<{ path: string; token: string }>> {
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  const s = await signedUploadUrl("vendorCards", vendorCardPath(actor.id, randomUUID()));
  return s ? { ok: true, data: s } : { ok: false, error: "upload.failed" };
}

// ---------- C-02 간단 등록 ----------
/**
 * 임시저장. 멱등: 같은 productId로 다시 오면(오프라인 재전송) 이미 만든 상품을 돌려준다.
 * 요청 항목에서 들어왔고 항목이 assigned면 sourcing으로 넘긴다(현장 소싱 시작).
 */
export async function createQuickProduct(input: unknown): Promise<Result<{ productId: string; created: boolean }>> {
  const parsed = QuickProductInput.safeParse(input);
  if (!parsed.success) {
    const m = parsed.error.issues[0]?.message ?? "";
    return { ok: false, error: m.startsWith("product.") ? m : "common.invalid" };
  }
  const v = parsed.data;
  const actor = await requireCn();
  if (!actor) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();

  const { data: existing } = await db.from("products").select("id, created_by").eq("id", v.productId).maybeSingle();
  if (existing) {
    if (actor.role !== "ADMIN" && existing.created_by !== actor.id) return { ok: false, error: "common.notFound" };
    return { ok: true, data: { productId: v.productId, created: false } };
  }
  if (v.imagePaths.some((p) => !isOwnProductImagePath(actor.id, v.productId, p))) return { ok: false, error: "common.forbidden" };
  if (!(await pathsExist("productImages", v.imagePaths))) return { ok: false, error: "upload.missing" };
  if (v.newVendor?.cardImagePath && !(await pathsExist("vendorCards", [v.newVendor.cardImagePath]))) return { ok: false, error: "upload.missing" };

  // 요청 항목: 배정자 본인 + 배정·소싱 중
  let item: { id: string; status: string; category: string | null } | null = null;
  if (v.requestItemId) {
    let q = db.from("request_items").select("id, status, assigned_to, category").eq("id", v.requestItemId);
    if (actor.role !== "ADMIN") q = q.eq("assigned_to", actor.id);
    const { data } = await q.maybeSingle();
    if (!data) return { ok: false, error: "common.forbidden" };
    // 오프라인 큐가 늦게 도착해 항목이 이미 offered/closed 등으로 넘어갔으면 상품은 만들고 연결만 하지 않는다(큐에 영원히 남지 않게)
    if (data.status === "assigned" || data.status === "sourcing") item = data;
  }

  // 원청: 기존 또는 신규
  let vendor: { id: string; default_sample_ok: boolean; market: string | null; booth: string | null } | null = null;
  if (actor.role === "CN_VENDOR") {
    // 원청 본인은 지정된 원청 1곳에 고정 — 입력값은 무시, 신규 원청 생성 불가 (COWORK_DECISIONS Q5)
    const { data } = await db.from("vendors").select("id, default_sample_ok, market, booth").eq("owner_profile_id", actor.id).maybeSingle();
    if (!data) return { ok: false, error: "product.error.vendorNotAssigned" };
    vendor = data;
  } else if (v.vendorId) {
    const { data } = await db.from("vendors").select("id, default_sample_ok, market, booth").eq("id", v.vendorId).maybeSingle();
    if (!data) return { ok: false, error: "product.error.vendor" };
    vendor = data;
  } else if (v.newVendor) {
    const card = v.newVendor.cardImagePath || null;
    if (card && !isOwnVendorCardPath(actor.id, card)) return { ok: false, error: "common.forbidden" };
    // 클라이언트가 만든 id로 멱등 생성 — 재전송해도 원청이 늘지 않는다 (리뷰 2)
    const { data: prior } = await db.from("vendors").select("id, created_by, default_sample_ok, market, booth").eq("id", v.newVendor.id).maybeSingle();
    if (prior && prior.created_by !== actor.id) return { ok: false, error: "common.forbidden" };
    if (prior) vendor = prior;
    else {
      const { data, error } = await db
        .from("vendors")
        .insert({ id: v.newVendor.id, name: v.newVendor.name, market: v.newVendor.market || null, booth: v.newVendor.booth || null, wechat: v.newVendor.wechat || null, card_image_path: card, created_by: actor.id })
        .select("id, default_sample_ok, market, booth")
        .single();
      if (error || !data) return { ok: false, error: "common.error" };
      vendor = data;
    }
  }

  const settings = await getSettings();
  const now = new Date();
  const captured = v.imageCaptured.some(Boolean);
  const { owner_role, due_at } = ownerAndDue("product", "draft", now, settings);
  const { error: pe } = await db.from("products").insert({
    id: v.productId,
    vendor_id: vendor!.id,
    created_by: actor.id,
    status: "draft",
    owner_role,
    due_at: due_at?.toISOString() ?? null,
    category: item?.category ?? null, // 요청 항목에서 만든 상품은 항목 카테고리를 물려받는다 (11-12 점검)
    name_zh: v.nameZh || null,
    quality_note_zh: v.memoZh || null,
    origin: "CN",
    sample_ok: v.sampleOk ?? vendor!.default_sample_ok,
    verified_in_person: captured,
    verified_at: captured ? now.toISOString() : null,
    verified_by: captured ? actor.id : null,
    verified_place: captured ? [vendor!.market, vendor!.booth].filter(Boolean).join(" ") || null : null,
    source_request_item_id: item?.id ?? null,
  });
  if (pe) return { ok: false, error: "common.error" };
  const rollback = async () => {
    await db.from("products").delete().eq("id", v.productId);
  };
  const { error: ce } = await db.from("product_costs").insert({ product_id: v.productId, tiers: normalizeTiers(v.costTiers), source_market: vendor!.market });
  if (ce) return rollback().then(() => ({ ok: false as const, error: "common.error" }));
  const { error: ie } = await db.from("product_images").insert(
    // 사진별 촬영 여부 (리뷰 4): 카메라로 찍은 첫 장만 실물컷, 앨범 사진은 원청 제공·판매 미사용으로 시작
    v.imagePaths.map((p, i) => {
      const cam = v.imageCaptured[i] ?? false;
      return { product_id: v.productId, storage_path: p, kind: cam && i === v.imageCaptured.indexOf(true) ? "real" : "detail", source: cam ? "own" : "vendor", usable_for_sales: cam, sort_order: i };
    }),
  );
  if (ie) return rollback().then(() => ({ ok: false as const, error: "common.error" }));

  await db.from("audit_logs").insert({ actor_id: actor.id, action: "product.create", entity: "product", entity_id: v.productId, diff: { request_item_id: item?.id ?? null, quick: true } });
  if (item?.status === "assigned") {
    await applyTransition(db, { entity: "request_item", id: item.id, from: "assigned", to: "sourcing", role: actor.role, actorId: actor.id, settings });
  }
  revalidate();
  revalidatePath("/cn", "page");
  return { ok: true, data: { productId: v.productId, created: true } };
}

// ---------- C-03 상세 ----------
/**
 * 상세 저장. 검수 대기 중엔 잠김. 공개(검수완료) 이후 원가·공급 조건이 바뀌면 recheck로 전이 —
 * 걸린 제안은 DB 트리거(cascade_product_recheck)가 가린다(PRD D16). 원가 변경은 감사 로그(CLAUDE.md 규칙 12).
 */
export async function updateProduct(productId: string, patch: unknown): Promise<Result<{ recheck: boolean }>> {
  const parsed = ProductDetailInput.safeParse(patch);
  if (!Id.safeParse(productId).success || !parsed.success) {
    const m = parsed.success ? "" : (parsed.error.issues[0]?.message ?? "");
    return { ok: false, error: m.startsWith("product.") ? m : "common.invalid" };
  }
  const actor = await requireCn();
  const full = actor && (await getMyProduct(actor, productId));
  if (!actor || !full) return { ok: false, error: "common.notFound" };
  const cur = full.product;
  if (!isEditableByCn(cur.status)) return { ok: false, error: "product.error.locked" };
  const db = createAdminClient();
  const v = parsed.data;

  const map: [keyof typeof v, string][] = [
    ["category", "category"], ["nameZh", "name_zh"], ["descZh", "desc_zh"], ["qualityNoteZh", "quality_note_zh"], ["fabric", "fabric"], ["origin", "origin"],
    ["careCodes", "care_codes"], ["supplyType", "supply_type"], ["leadDays", "lead_days"], ["productionMoq", "production_moq"], ["minQty", "min_qty"],
    ["weightG", "weight_g"], ["sampleOk", "sample_ok"], ["sampleCostCny", "sample_cost_cny"], ["verifiedPlace", "verified_place"], ["vendorId", "vendor_id"],
    ["holdOverride", "hold_override"], ["labelOptionsOverride", "label_options_override"], ["modOptionsOverride", "mod_options_override"],
  ];
  const sent: Record<string, unknown> = {};
  for (const [k, col] of map) if (v[k] !== undefined) sent[col] = v[k];
  if (v.verifiedInPerson !== undefined) sent.verified_in_person = v.verifiedInPerson;
  // 실제로 바뀐 것만 (리뷰: 키를 보냈다는 이유로 재확인하지 않는다)
  const cols = changedColumns(cur, sent);
  const row: Record<string, unknown> = Object.fromEntries(cols.map((c) => [c, sent[c]]));
  if ("verified_in_person" in row) {
    row.verified_at = row.verified_in_person ? new Date().toISOString() : null;
    row.verified_by = row.verified_in_person ? actor.id : null;
  }
  const tiersChanged = !!v.costTiers && !tiersEqual(v.costTiers, full.cost.tiers);
  if (!cols.length && !tiersChanged) return { ok: true, data: { recheck: false } };

  // 원청: 존재 + CN_VENDOR는 자기가 만든 원청만 (리뷰 9)
  let nextVendor: { default_hold: unknown; default_sample_ok: boolean; default_label_options: unknown; default_mod_options: unknown } | null = full.vendor;
  if ("vendor_id" in row) {
    if (actor.role === "CN_VENDOR") return { ok: false, error: "common.forbidden" }; // 원청 변경은 SOURCER·ADMIN만 (Q5)
    const { data } = await db.from("vendors").select("id, created_by, default_hold, default_sample_ok, default_label_options, default_mod_options").eq("id", row.vendor_id as string).maybeSingle();
    if (!data) return { ok: false, error: "product.error.vendor" };
    nextVendor = data;
  }

  // 공개 상품: 저장 전 충족했던 조건을 깨는 수정만 거부 (리뷰 6 → B1: 원래 미달인 조건은 막지 않는다)
  if (isPublished(cur.status)) {
    const after = productPublishChecks({
      product: { ...cur, ...row }, vendor: nextVendor, images: full.images, colorCount: full.colors.length, sizeCount: full.sizes.length,
      costTierCount: (v.costTiers ?? full.cost.tiers).length,
    });
    const err = publishedEditError(cur.status, full.checks, after);
    if (err) return { ok: false, error: err };
  }

  const reason = recheckReason(cur.status, [...cols.map((c) => COLUMN_FIELD[c] ?? c), ...(tiersChanged ? ["costTiers"] : [])]);
  if (reason) {
    // 필드 변경과 recheck 전이를 한 update로 (낙관적 잠금 포함) — 그 뒤에 원가를 쓴다 (리뷰 1)
    const res = await applyTransition(db, {
      entity: "product", id: productId, from: cur.status, to: "recheck", role: actor.role, actorId: actor.id, settings: await getSettings(),
      patch: { ...row, recheck_reason: reason }, note: reason,
    });
    if (!res.ok) return res;
  } else if (Object.keys(row).length) {
    const { data, error } = await db.from("products").update(row).eq("id", productId).eq("status", cur.status).select("id");
    if (error) return { ok: false, error: "common.error" };
    if (!data?.length) return { ok: false, error: "common.staleState" };
  }
  if (tiersChanged && v.costTiers) {
    const tiers = normalizeTiers(v.costTiers);
    const { error } = await db.from("product_costs").upsert({ product_id: productId, tiers, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: "common.error" };
    await db.from("audit_logs").insert({ actor_id: actor.id, action: "price.cost_update", entity: "product", entity_id: productId, diff: { from: full.cost.tiers, to: tiers } });
  }
  revalidate(productId);
  return { ok: true, data: { recheck: !!reason } };
}

/** 컬러 저장(전체 교체) + variant 동기화 */
export async function saveColors(productId: string, colors: unknown): Promise<Result<null>> {
  const parsed = z.array(ColorInput).max(20).safeParse(colors);
  if (!Id.safeParse(productId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  return saveAxis(productId, "colors", parsed.data.map((c, i) => ({ id: c.id, name_zh: c.nameZh, name_ko: c.nameKo || null, hex: c.hex || null, sort_order: i })));
}

/** 사이즈 저장(전체 교체) + 실측 범위 체크 + variant 동기화 */
export async function saveSizes(productId: string, sizes: unknown): Promise<Result<null>> {
  const parsed = z.array(SizeInput).max(15).safeParse(sizes);
  if (!Id.safeParse(productId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  if (parsed.data.some((s) => measurementErrors(s.measurements).length)) return { ok: false, error: "product.error.measurement" };
  return saveAxis(productId, "sizes", parsed.data.map((s, i) => ({ id: s.id, label: s.label, measurements: s.measurements, source: s.source, sort_order: i })));
}

async function saveAxis(productId: string, axis: "colors" | "sizes", rows: Record<string, unknown>[]): Promise<Result<null>> {
  const actor = await requireCn();
  const p = actor && (await loadOwn(actor, productId));
  if (!actor || !p) return { ok: false, error: "common.notFound" };
  if (!isEditableByCn(p.status)) return { ok: false, error: "product.error.locked" };
  const db = createAdminClient();
  const table = axis === "colors" ? "product_colors" : "product_sizes";
  const { data: current } = await db.from(table).select("id").eq("product_id", productId);
  const keep = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  // 다른 상품의 행 id를 끼워 넣는 것 방지: 기존 id는 이 상품 것만
  if ([...keep].some((id) => !(current ?? []).some((c) => c.id === id))) return { ok: false, error: "common.forbidden" };
  // 공개 상품: 있던 컬러·사이즈를 0개로 만드는 저장만 거부 (B1 — 0개였던 상품에 추가는 항상 허용)
  if (isPublished(p.status) && (current ?? []).length > 0 && rows.length === 0) return { ok: false, error: "product.error.wouldBreakChecks" };
  const removed = (current ?? []).filter((c) => !keep.has(c.id)).map((c) => c.id);
  if (removed.length) {
    const { error } = await db.from(table).delete().in("id", removed); // variant는 cascade. 샘플·발주에 쓰인 variant면 FK로 실패
    if (error) return { ok: false, error: "product.error.variantInUse" };
  }
  for (const r of rows) {
    const { id, ...rest } = r;
    const { error } = id ? await db.from(table).update(rest).eq("id", id as string) : await db.from(table).insert({ ...rest, product_id: productId });
    if (error) return { ok: false, error: "common.error" };
  }
  const [{ data: colors }, { data: sizes }, { data: variants }] = await Promise.all([
    db.from("product_colors").select("id").eq("product_id", productId),
    db.from("product_sizes").select("id").eq("product_id", productId),
    db.from("product_variants").select("id, color_id, size_id").eq("product_id", productId),
  ]);
  const sync = syncVariants(colors ?? [], sizes ?? [], variants ?? []);
  if (sync.remove.length) {
    const { error } = await db.from("product_variants").delete().in("id", sync.remove);
    if (error) return { ok: false, error: "product.error.variantInUse" };
  }
  if (sync.insert.length) {
    const { error } = await db.from("product_variants").insert(sync.insert.map((x) => ({ ...x, product_id: productId })));
    if (error) return { ok: false, error: "common.error" };
  }
  // 지운 컬러를 가리키던 사진 연결 해제 (product_images.color_id에는 FK가 없다)
  if (axis === "colors" && removed.length) await db.from("product_images").update({ color_id: null }).in("color_id", removed);
  revalidate(productId);
  return { ok: true, data: null };
}

/** 사진 추가 (업로드 완료된 경로) */
export async function addProductImages(productId: string, paths: unknown): Promise<Result<null>> {
  const parsed = z.array(z.string().max(200)).min(1).max(15).safeParse(paths);
  if (!Id.safeParse(productId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const p = actor && (await loadOwn(actor, productId));
  if (!actor || !p) return { ok: false, error: "common.notFound" };
  if (!isEditableByCn(p.status)) return { ok: false, error: "product.error.locked" };
  if (parsed.data.some((x) => !isOwnProductImagePath(ownerOf(actor, p), productId, x))) return { ok: false, error: "common.forbidden" };
  if (!(await pathsExist("productImages", parsed.data))) return { ok: false, error: "upload.missing" };
  const db = createAdminClient();
  const { count } = await db.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
  const { error } = await db.from("product_images").insert(parsed.data.map((x, i) => ({ product_id: productId, storage_path: x, kind: "detail", source: "own", sort_order: (count ?? 0) + i })));
  if (error) return { ok: false, error: "common.error" };
  revalidate(productId);
  return { ok: true, data: null };
}

/** 사진 메타(종류·출처·판매 사용·순서·컬러) 일괄 저장 */
export async function updateProductImages(productId: string, metas: unknown): Promise<Result<null>> {
  const parsed = z.array(ImageMetaInput).max(30).safeParse(metas);
  if (!Id.safeParse(productId).success || !parsed.success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const p = actor && (await loadOwn(actor, productId));
  if (!actor || !p) return { ok: false, error: "common.notFound" };
  if (!isEditableByCn(p.status)) return { ok: false, error: "product.error.locked" };
  const db = createAdminClient();
  const [{ data: imgs }, { data: colors }] = await Promise.all([
    db.from("product_images").select("id").eq("product_id", productId),
    db.from("product_colors").select("id").eq("product_id", productId),
  ]);
  const ids = new Set((imgs ?? []).map((i) => i.id));
  const colorIds = new Set((colors ?? []).map((c) => c.id));
  if (parsed.data.some((m) => !ids.has(m.id) || (m.colorId && !colorIds.has(m.colorId)))) return { ok: false, error: "common.forbidden" };
  if (isPublished(p.status)) {
    const full = await getMyProduct(actor, productId);
    if (!full) return { ok: false, error: "common.notFound" };
    const meta = new Map(parsed.data.map((m) => [m.id, m]));
    const images = full.images.map((i) => ({ kind: meta.get(i.id)?.kind ?? i.kind, source: meta.get(i.id)?.source ?? i.source }));
    const after = productPublishChecks({ product: full.product, vendor: full.vendor, images, colorCount: full.colors.length, sizeCount: full.sizes.length, costTierCount: full.cost.tiers.length });
    const err = publishedEditError(p.status, full.checks, after);
    if (err) return { ok: false, error: err };
  }
  for (const m of parsed.data) {
    // 참고용 사진은 판매(상세페이지)에 쓸 수 없다 (기획서 §6)
    const usable = m.source === "reference" ? false : m.usableForSales;
    await db.from("product_images").update({ kind: m.kind, source: m.source, usable_for_sales: usable, sort_order: m.sortOrder, color_id: m.colorId ?? null }).eq("id", m.id);
  }
  revalidate(productId);
  return { ok: true, data: null };
}

export async function deleteProductImage(productId: string, imageId: string): Promise<Result<null>> {
  if (!Id.safeParse(productId).success || !Id.safeParse(imageId).success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const p = actor && (await loadOwn(actor, productId));
  if (!actor || !p) return { ok: false, error: "common.notFound" };
  if (!isEditableByCn(p.status)) return { ok: false, error: "product.error.locked" };
  const db = createAdminClient();
  const { data: img } = await db.from("product_images").select("id, storage_path").eq("id", imageId).eq("product_id", productId).maybeSingle();
  if (!img) return { ok: false, error: "common.notFound" };
  if (isPublished(p.status)) {
    const full = await getMyProduct(actor, productId);
    if (!full) return { ok: false, error: "common.notFound" };
    const after = productPublishChecks({ product: full.product, vendor: full.vendor, images: full.images.filter((i) => i.id !== imageId), colorCount: full.colors.length, sizeCount: full.sizes.length, costTierCount: full.cost.tiers.length });
    const err = publishedEditError(p.status, full.checks, after);
    if (err) return { ok: false, error: err };
  }
  await db.from("product_images").delete().eq("id", imageId);
  await db.storage.from("product-images").remove([img.storage_path]);
  revalidate(productId);
  return { ok: true, data: null };
}

/**
 * 상품 삭제 (C-03, 사이트 수정 5): 내 상품(ADMIN 전체) + 임시저장·반려 + 제안 0건일 때만. 사진 파일도 지운다.
 * 행 삭제는 상태 조건을 다시 걸어(낙관적) 그 사이 검수 요청된 상품은 지우지 않는다. 감사 로그를 남긴다.
 */
export async function deleteProduct(productId: string): Promise<Result<null>> {
  if (!Id.safeParse(productId).success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const p = actor && (await loadOwn(actor, productId));
  if (!actor || !p) return { ok: false, error: "common.notFound" };
  const db = createAdminClient();
  const { count } = await db.from("offers").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if (!canDeleteProduct(p.status, count ?? 0)) return { ok: false, error: "product.delete.notAllowed" };
  const { data: imgs } = await db.from("product_images").select("storage_path").eq("product_id", productId);
  await db.from("cn_questions").update({ product_id: null }).eq("product_id", productId); // 질문은 항목에 남긴다(FK에 cascade 없음)
  const { data: gone, error } = await db.from("products").delete().eq("id", productId).in("status", ["draft", "rejected"]).select("id");
  if (error || !gone?.length) return { ok: false, error: error ? "common.error" : "common.staleState" };
  const paths = (imgs ?? []).map((i) => i.storage_path).filter(Boolean);
  if (paths.length) await db.storage.from("product-images").remove(paths);
  await db.from("audit_logs").insert({ actor_id: actor.id, action: "product.delete", entity: "product", entity_id: productId, diff: { status: p.status, photos: paths.length } });
  revalidatePath("/cn/products", "page");
  revalidatePath("/cn", "page");
  return { ok: true, data: null };
}

/** 提交审核: 공개 조건을 서버가 다시 계산 — 하나라도 빠지면 거부 (CLAUDE.md 절대 규칙 6) */
export async function requestReview(productId: string): Promise<Result<null>> {
  if (!Id.safeParse(productId).success) return { ok: false, error: "common.invalid" };
  const actor = await requireCn();
  const full = actor && (await getMyProduct(actor, productId));
  if (!actor || !full) return { ok: false, error: "common.notFound" };
  if (!canRequestReview(full.checks)) return { ok: false, error: "product.error.checksFailed" };
  const res = await applyTransition(createAdminClient(), {
    entity: "product", id: productId, from: full.product.status, to: "pending_review", role: actor.role, actorId: actor.id, settings: await getSettings(),
    patch: { rejected_reasons: [] },
  });
  if (!res.ok) return res;
  await notify({ type: "product.review_requested", productId });
  revalidate(productId);
  return { ok: true, data: null };
}
