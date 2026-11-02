import type { ExportProduct } from "./common";

/**
 * 패키지 입력 원본 (순수): 브랜드 뷰 행(B-12 샘플 채택) 또는 발주 확정 스냅샷(DECISIONS 9-7)을 같은 모양으로 만든다.
 * 사진은 아직 경로뿐 — 변환에 성공한 것만 호출부가 images/{code}_{nn}.jpg 로 이름 붙인다.
 * 입력 행 타입에 원가·원청·중량·환율·마진·*_zh 컬럼이 없다(절대 규칙 1). 스냅샷도 이 함수로만 만든다.
 */
export type ExportBase = Omit<ExportProduct, "images">;
export type ExportSource = { productId: string; base: ExportBase; photoPaths: string[] };

export type SourceProductRow = {
  id: string; code: string; name_ko: string | null; category: string | null; desc_ko: string | null; quality_note_ko: string | null;
  fabric: unknown; origin: string | null; care_codes: unknown; supply_type: string | null; lead_days: number | null; min_qty: number | null;
  verified_in_person: boolean | null;
};
export type SourceRows = {
  colors: { id: string; product_id: string; name_ko: string | null }[];
  sizes: { id: string; product_id: string; label: string; measurements: unknown; source: string | null }[];
  variants: { product_id: string; color_id: string; size_id: string }[];
  /** 판매용 사진만: source='own' AND usable_for_sales (r7-13) — 호출부 쿼리가 거른다 */
  images: { product_id: string; storage_path: string | null }[];
};

const SUPPLY = ["stock", "production", "mixed"] as const;

export function toExportSource(p: SourceProductRow, r: SourceRows): ExportSource {
  const cs = r.colors.filter((c) => c.product_id === p.id);
  const ss = r.sizes.filter((s) => s.product_id === p.id);
  return {
    productId: p.id,
    base: {
      code: p.code, name: p.name_ko ?? "", category: p.category, desc: p.desc_ko, qualityNote: p.quality_note_ko,
      fabric: (Array.isArray(p.fabric) ? p.fabric : []) as ExportProduct["fabric"], origin: p.origin,
      careCodes: (Array.isArray(p.care_codes) ? p.care_codes : []) as string[],
      colors: cs.map((c) => c.name_ko ?? ""),
      sizes: ss.map((s) => ({
        label: s.label, measurements: (s.measurements ?? {}) as Record<string, number>,
        source: s.source === "measured" || s.source === "vendor" ? s.source : undefined,
      })),
      variants: r.variants.filter((v) => v.product_id === p.id).flatMap((v) => {
        const c = cs.find((x) => x.id === v.color_id)?.name_ko ?? "";
        const s = ss.find((x) => x.id === v.size_id)?.label ?? "";
        return c || s ? [{ color: c, size: s }] : [];
      }),
      supplyType: (SUPPLY as readonly string[]).includes(p.supply_type ?? "") ? (p.supply_type as ExportBase["supplyType"]) : null,
      leadDays: p.lead_days, minQty: p.min_qty, verified: p.verified_in_person !== false,
    },
    photoPaths: r.images.filter((i) => i.product_id === p.id && i.storage_path).map((i) => i.storage_path!),
  };
}

/** 변환에 성공한 사진 수만큼 images/{code}_{nn}.jpg 이름을 붙여 ExportProduct로 */
export const withImages = (s: ExportSource, count: number): ExportProduct => ({
  ...s.base,
  images: Array.from({ length: count }, (_, k) => `images/${s.base.code}_${String(k + 1).padStart(2, "0")}.jpg`),
});

/** 스냅샷 jsonb → ExportSource (모양이 깨졌으면 null) */
export function fromSnapshot(productId: string, data: unknown): ExportSource | null {
  const d = data as { base?: ExportBase; photoPaths?: unknown } | null;
  if (!d?.base || typeof d.base.code !== "string" || !Array.isArray(d.photoPaths)) return null;
  return { productId, base: d.base, photoPaths: d.photoPaths.filter((x): x is string => typeof x === "string") };
}
