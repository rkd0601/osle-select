/**
 * 상품 등록 순수 로직 (C-02·C-03·C-04). PRD 4·5장, 기획서 §6·§10 F2·F3.
 * 원가(CNY)는 이 모듈과 서버 액션 안에서만 다룬다. 브랜드 응답으로 나가지 않는다.
 */
import { z } from "zod";
import { CARE, MATERIALS, MEASUREMENT_RANGE, MOD_ITEMS, ORIGINS, IMAGE_KINDS, IMAGE_SOURCES, SUPPLY_TYPES, isCode } from "./codes";
import { publishChecks, type PublishCheck } from "./transitions";
import { stableJson } from "./json";

const uuid = z.guid();
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// ---------- Storage 경로 ----------
/** 상품 사진: <actor>/<product>/<uuid>.jpg (11-06 전 것은 .webp) — 업로드한 담당자·상품 prefix 밖은 서버가 거부 */
export const productImagePath = (actorId: string, productId: string, id: string) => `${actorId}/${productId}/${id}.jpg`;
export const isOwnProductImagePath = (actorId: string, productId: string, path: string) =>
  new RegExp(`^${actorId}/${productId}/${UUID_RE}\\.(?:jpg|webp)$`).test(path);
/** 원청 명함·매장 사진: <actor>/<uuid>.jpg (예전 .webp) */
export const vendorCardPath = (actorId: string, id: string) => `${actorId}/${id}.jpg`;
export const isOwnVendorCardPath = (actorId: string, path: string) => new RegExp(`^${actorId}/${UUID_RE}\\.(?:jpg|webp)$`).test(path);

// ---------- 원가 구간 ----------
export const CostTier = z.object({
  min_qty: z.coerce.number().int().min(1).max(1_000_000),
  cost_cny: z.coerce.number().min(0).max(100_000).transform((n) => Math.round(n * 100) / 100), // numeric(10,2)
});
export type CostTier = z.infer<typeof CostTier>;

/** 기획서 F3: 수량 오름차순, 수량 중복 없음, 단가 단조 감소(같거나 내려감) */
export function costTiersError(tiers: CostTier[]): string | null {
  if (!tiers.length) return "product.error.noCost";
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_qty === sorted[i - 1].min_qty) return "product.error.tierDupQty";
    if (sorted[i].cost_cny > sorted[i - 1].cost_cny) return "product.error.tierNotDecreasing";
  }
  return null;
}
export const normalizeTiers = (tiers: CostTier[]) => [...tiers].sort((a, b) => a.min_qty - b.min_qty);
const Tiers = z.array(CostTier).min(1).max(8).superRefine((t, ctx) => {
  const e = costTiersError(t);
  if (e) ctx.addIssue({ code: "custom", message: e });
});

// ---------- 원청 기본값 ----------
export const HoldSchema = z.union([
  z.object({ none: z.literal(true) }),
  z.object({ deposit_pct: z.number().min(0.05).max(1), days: z.number().int().min(1).max(60) }),
]);
export type Hold = z.infer<typeof HoldSchema>;
export const LabelOption = z.object({
  type: z.enum(["main_label", "care_label", "hangtag", "polybag", "tag_attach"]),
  moq: z.number().int().min(1),
  unit_cost_cny: z.number().min(0),
  lead_days: z.number().int().min(0).max(90),
});
export const ModOption = z.object({
  item: z.enum(MOD_ITEMS), // 코드값 — 자유 입력 금지(브랜드 화면에 중국어가 나가던 문제)
  moq: z.number().int().min(1),
  cost_cny: z.number().min(0),
  lead_days: z.number().int().min(0).max(120),
});

export const VendorInput = z.object({
  name: z.string().trim().min(1).max(60),
  market: z.string().trim().max(60).optional().or(z.literal("")),
  booth: z.string().trim().max(30).optional().or(z.literal("")),
  wechat: z.string().trim().max(60).optional().or(z.literal("")),
  cardImagePath: z.string().max(200).optional().nullable(),
});
export const VendorDefaults = z.object({
  defaultHold: HoldSchema,
  defaultSampleOk: z.boolean(),
  defaultLabelOptions: z.array(LabelOption).max(10),
  defaultModOptions: z.array(ModOption).max(20),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

type VendorDefaultsRow = { default_hold: unknown; default_sample_ok: boolean; default_label_options: unknown; default_mod_options: unknown } | null;
type ProductOverrides = { hold_override: unknown; label_options_override: unknown; mod_options_override: unknown; sample_ok: boolean | null };

/** 원청 기본값 상속 (기획서 F3). 상품 override가 있으면 그것, 없으면 원청 기본값. 홀딩은 어느 쪽에도 없으면 미해결. */
export function resolveInherited(p: ProductOverrides, v: VendorDefaultsRow) {
  const hold = (p.hold_override ?? v?.default_hold ?? null) as Hold | null;
  return {
    hold,
    holdResolved: !!hold && HoldSchema.safeParse(hold).success,
    labelOptions: (p.label_options_override ?? v?.default_label_options ?? []) as z.infer<typeof LabelOption>[],
    modOptions: (p.mod_options_override ?? v?.default_mod_options ?? []) as z.infer<typeof ModOption>[],
    sampleOk: p.sample_ok ?? v?.default_sample_ok ?? true,
    inherited: { hold: p.hold_override == null, labels: p.label_options_override == null, mods: p.mod_options_override == null },
  };
}

// ---------- C-02 모바일 간단 등록 ----------
/**
 * 임시저장 최소 세트 (기획서 F2): 사진 1장 이상 + 원가(구간) + 원청(기존 또는 신규). 이름·메모는 선택.
 * productId는 클라이언트가 만든다 — 오프라인 큐가 같은 id로 재전송해도 한 번만 생긴다(멱등).
 */
export const QuickProductInput = z
  .object({
    productId: uuid,
    requestItemId: uuid.optional().nullable(),
    imagePaths: z.array(z.string().max(200)).min(1).max(15),
    imageCaptured: z.array(z.boolean()).max(15), // 사진별 카메라 직촬 여부(imagePaths와 같은 순서). 하나라도 true면 실물 확인 자동
    costTiers: Tiers,
    vendorId: uuid.optional().nullable(),
    newVendor: VendorInput.extend({ id: uuid }).optional().nullable(), // id는 클라이언트 생성(멱등)
    nameZh: z.string().trim().max(100).optional().or(z.literal("")),
    memoZh: z.string().trim().max(500).optional().or(z.literal("")),
    sampleOk: z.boolean().optional(),
  })
  .refine((v) => !!v.vendorId !== !!v.newVendor, { message: "product.error.vendor", path: ["vendorId"] })
  .refine((v) => v.imageCaptured.length === v.imagePaths.length, { message: "common.invalid", path: ["imageCaptured"] });
export type QuickProductInput = z.infer<typeof QuickProductInput>;

// ---------- C-03 PC 상세 ----------
export const FabricPart = z.object({ material_code: z.string().refine((c) => isCode(MATERIALS, c)), pct: z.number().min(0.1).max(100) });
export const ProductDetailInput = z.object({
  category: z.string().trim().max(30).nullable().optional(),
  nameZh: z.string().trim().max(100).nullable().optional(),
  descZh: z.string().trim().max(2000).nullable().optional(),
  qualityNoteZh: z.string().trim().max(1000).nullable().optional(),
  fabric: z.array(FabricPart).max(6).optional(),
  origin: z.string().refine((c) => isCode(ORIGINS, c)).optional(),
  careCodes: z.array(z.string().refine((c) => isCode(CARE, c))).max(8).optional(),
  supplyType: z.enum(SUPPLY_TYPES).nullable().optional(),
  leadDays: z.number().int().min(0).max(180).nullable().optional(),
  productionMoq: z.number().int().min(1).max(1_000_000).nullable().optional(),
  minQty: z.number().int().min(1).max(1_000_000).nullable().optional(),
  weightG: z.number().int().min(10).max(20_000).nullable().optional(),
  sampleOk: z.boolean().optional(), // products.sample_ok는 not null (원청 기본값은 등록 시 복사)
  sampleCostCny: z.number().min(0).max(100_000).nullable().optional(),
  verifiedInPerson: z.boolean().optional(),
  verifiedPlace: z.string().trim().max(60).nullable().optional(),
  vendorId: uuid.nullable().optional(),
  costTiers: Tiers.optional(),
  holdOverride: HoldSchema.nullable().optional(),
  labelOptionsOverride: z.array(LabelOption).max(10).nullable().optional(),
  modOptionsOverride: z.array(ModOption).max(20).nullable().optional(),
});
export type ProductDetailInput = z.infer<typeof ProductDetailInput>;

export const ColorInput = z.object({ id: uuid.optional(), nameZh: z.string().trim().min(1).max(30), nameKo: z.string().trim().max(30).optional().or(z.literal("")), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")) });
export const SizeInput = z.object({
  id: uuid.optional(),
  label: z.string().trim().min(1).max(20),
  measurements: z.record(z.string(), z.number()).default({}),
  source: z.enum(["vendor", "measured"]).default("vendor"),
});
export const ImageMetaInput = z.object({
  id: uuid,
  kind: z.enum(IMAGE_KINDS),
  source: z.enum(IMAGE_SOURCES),
  usableForSales: z.boolean(),
  sortOrder: z.number().int().min(0).max(100),
  colorId: uuid.nullable().optional(),
});

/** 실측 범위 체크 (기획서 F3 "총장 20~160 등"). 범위 밖 부위 코드 목록 */
export function measurementErrors(m: Record<string, number>): string[] {
  return Object.entries(m).filter(([k, v]) => {
    const r = MEASUREMENT_RANGE[k];
    return !r || !(v >= r[0] && v <= r[1]);
  }).map(([k]) => k);
}

/** 혼용률 합 (소수 한 자리) */
export const fabricSum = (f: { pct: number }[]) => Math.round(f.reduce((s, x) => s + x.pct, 0) * 10) / 10;

/** 컬러 × 사이즈 → 있어야 할 variant 쌍과 지워야 할 기존 variant */
export function syncVariants(colors: { id: string }[], sizes: { id: string }[], existing: { id: string; color_id: string; size_id: string }[]) {
  const want = colors.flatMap((c) => sizes.map((s) => `${c.id}:${s.id}`));
  const have = new Map(existing.map((v) => [`${v.color_id}:${v.size_id}`, v.id]));
  return {
    insert: want.filter((k) => !have.has(k)).map((k) => ({ color_id: k.split(":")[0], size_id: k.split(":")[1] })),
    remove: existing.filter((v) => !want.includes(`${v.color_id}:${v.size_id}`)).map((v) => v.id),
  };
}

// ---------- 상태 ----------
/** CN이 내용을 고칠 수 있는 상태. 검수 대기 중에는 잠근다(관리자가 보는 중). 공개 이후 수정은 재확인을 부른다. */
export const isEditableByCn = (s: string) => ["draft", "rejected", "reviewed", "offering", "repool", "recheck"].includes(s);
/** 공개(검수완료) 이후 상태 — 원가·공급 조건이 바뀌면 재확인(PRD D16) */
export const isPublished = (s: string) => s === "reviewed" || s === "offering" || s === "repool";
/** 가격·공급에 영향이 있는 필드. 이 중 하나라도 바뀌면 recheck */
export const RECHECK_FIELDS = ["costTiers", "supplyType", "leadDays", "productionMoq", "minQty", "holdOverride", "vendorId"] as const;
export function recheckReason(status: string, changed: string[]): string | null {
  if (!isPublished(status)) return null;
  const hit = changed.filter((c) => (RECHECK_FIELDS as readonly string[]).includes(c));
  return hit.length ? hit.join(",") : null;
}

// ---------- 공개 조건 입력 ----------
export type ProductForChecks = {
  verified_in_person: boolean; sample_ok: boolean | null; fabric: { pct: number }[]; origin: string | null; care_codes: string[];
  min_qty: number | null; weight_g: number | null; supply_type: string | null; vendor_id: string | null; lead_days: number | null; production_moq: number | null;
  hold_override: unknown; label_options_override: unknown; mod_options_override: unknown;
};
export function productPublishChecks(args: {
  product: ProductForChecks;
  vendor: VendorDefaultsRow;
  images: { kind: string; source: string }[];
  colorCount: number;
  sizeCount: number;
  costTierCount: number;
}): PublishCheck[] {
  const { product: p } = args;
  const inh = resolveInherited(p, args.vendor);
  const usable = args.images.filter((i) => i.source !== "reference");
  return publishChecks({
    verified_in_person: p.verified_in_person,
    photo_count: usable.length,
    has_real_photo: args.images.some((i) => i.kind === "real" && i.source === "own"),
    sample_ok: inh.sampleOk,
    fabric_pct_sum: fabricSum(p.fabric ?? []),
    origin: p.origin,
    care_codes: p.care_codes ?? [],
    min_qty: p.min_qty,
    weight_g: p.weight_g,
    hold_resolved: inh.holdResolved,
    supply_type: p.supply_type,
    vendor_id: p.vendor_id,
    color_count: args.colorCount,
    size_count: args.sizeCount,
    cost_tier_count: args.costTierCount,
    lead_days: p.lead_days,
    production_moq: p.production_moq,
  });
}

/**
 * 공개 상품 수정 가드 (NEXT §0-g B1). 저장 **전에 충족했던** 조건이 저장 **후** 미충족이 되는 경우만 거부한다
 * (충족 집합 before ⊄ after). 원래 미달이던 조건은 보지 않는다 — 색상·사이즈·사진 추가처럼 나아지는 저장은 항상 허용.
 * 반환: 깨지는 조건 키 목록(비어 있으면 허용).
 */
export function brokenPublishChecks(before: PublishCheck[], after: PublishCheck[]): string[] {
  const okAfter = new Map(after.map((c) => [c.key, c.ok]));
  return before.filter((c) => c.ok && okAfter.get(c.key) !== true).map((c) => c.key);
}
/** 공개(검수완료) 상품이면 B1 가드를 적용해 에러 키를, 아니면 null */
export function publishedEditError(status: string, before: PublishCheck[], after: PublishCheck[]): string | null {
  if (!isPublished(status)) return null;
  return brokenPublishChecks(before, after).length ? "product.error.wouldBreakChecks" : null;
}

// ---------- 수정 판정 (리뷰 반영) ----------
/** 컬럼명 → C-03 필드명 (재확인 사유·판정용) */
export const COLUMN_FIELD: Record<string, string> = {
  supply_type: "supplyType", lead_days: "leadDays", production_moq: "productionMoq", min_qty: "minQty", hold_override: "holdOverride", vendor_id: "vendorId",
  label_options_override: "labelOptionsOverride", mod_options_override: "modOptionsOverride",
};
const norm = stableJson;
export { stableJson };
/** 보낸 값 중 DB 현재 값과 실제로 다른 컬럼만 (키를 보냈다는 이유로 재확인하지 않는다) */
export function changedColumns(current: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) => norm(current[k]) !== norm(patch[k]));
}
export const tiersEqual = (a: CostTier[], b: CostTier[]) =>
  norm(normalizeTiers(a).map((t) => [t.min_qty, t.cost_cny])) === norm(normalizeTiers(b).map((t) => [t.min_qty, t.cost_cny]));
