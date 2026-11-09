import { describe, it, expect } from "vitest";
import {
  costTiersError, fabricSum, isOwnProductImagePath, isOwnVendorCardPath, measurementErrors, productImagePath, productPublishChecks,
  QuickProductInput, recheckReason, resolveInherited, syncVariants, vendorCardPath, isEditableByCn, ProductDetailInput, changedColumns, tiersEqual,
  brokenPublishChecks, publishedEditError,
} from "@/lib/products";
import { canRequestReview } from "@/lib/transitions";
import { CARE, MATERIALS, CATEGORY_ZH, MEASUREMENTS, MEASUREMENT_TEMPLATE } from "@/lib/codes";
import { DEFAULT_CATEGORIES } from "@/lib/config";

const A = "00000000-0000-0000-0000-000000000002";
const P = "41000000-0000-4000-8000-000000000001";
const U = "6f1c2b9e-1111-4a5b-9c8d-123456789abc";

describe("원가 구간 (F3: 단조 감소)", () => {
  it("정상·정렬 무관", () => {
    expect(costTiersError([{ min_qty: 100, cost_cny: 68 }, { min_qty: 10, cost_cny: 73 }])).toBeNull();
  });
  it("수량이 늘었는데 단가가 오르면 거부, 같은 수량 중복 거부, 비어 있으면 거부", () => {
    expect(costTiersError([{ min_qty: 10, cost_cny: 68 }, { min_qty: 100, cost_cny: 73 }])).toBe("product.error.tierNotDecreasing");
    expect(costTiersError([{ min_qty: 10, cost_cny: 73 }, { min_qty: 10, cost_cny: 70 }])).toBe("product.error.tierDupQty");
    expect(costTiersError([])).toBe("product.error.noCost");
  });
});

describe("C-02 간단 등록 입력 (F2 최소 세트)", () => {
  const base = { productId: P, imagePaths: [productImagePath(A, P, U)], imageCaptured: [true], costTiers: [{ min_qty: 10, cost_cny: 73.2 }], vendorId: "20000000-0000-0000-0000-000000000001" };
  it("사진 1장 + 원가 + 원청이면 통과", () => expect(QuickProductInput.safeParse(base).success).toBe(true));
  it("사진 0장·원가 0개 거부", () => {
    expect(QuickProductInput.safeParse({ ...base, imagePaths: [], imageCaptured: [] }).success).toBe(false);
    expect(QuickProductInput.safeParse({ ...base, imageCaptured: [] }).success, "사진별 촬영 여부 길이 불일치").toBe(false);
    expect(QuickProductInput.safeParse({ ...base, costTiers: [] }).success).toBe(false);
  });
  it("원청은 기존 id 또는 신규 중 정확히 하나", () => {
    expect(QuickProductInput.safeParse({ ...base, vendorId: null }).success).toBe(false);
    expect(QuickProductInput.safeParse({ ...base, vendorId: null, newVendor: { id: U, name: "中洲 3F-312" } }).success).toBe(true);
    expect(QuickProductInput.safeParse({ ...base, vendorId: null, newVendor: { name: "id 없음" } }).success, "신규 원청은 클라이언트 id 필수(멱등)").toBe(false);
    expect(QuickProductInput.safeParse({ ...base, newVendor: { id: U, name: "x" } }).success).toBe(false);
  });
  it("원가는 0.01위안으로 반올림 (numeric(10,2))", () => {
    const r = QuickProductInput.parse({ ...base, costTiers: [{ min_qty: 10, cost_cny: 73.236 }] });
    expect(r.costTiers[0].cost_cny).toBe(73.24);
  });
});

describe("Storage 경로", () => {
  it("상품 사진은 담당자·상품 prefix만", () => {
    const p = productImagePath(A, P, U);
    expect(isOwnProductImagePath(A, P, p)).toBe(true);
    expect(isOwnProductImagePath("00000000-0000-0000-0000-000000000099", P, p)).toBe(false);
    expect(isOwnProductImagePath(A, "41000000-0000-4000-8000-000000000002", p)).toBe(false);
    expect(isOwnProductImagePath(A, P, `${A}/${P}/../x.webp`)).toBe(false);
  });
  it("원청 명함", () => {
    expect(isOwnVendorCardPath(A, vendorCardPath(A, U))).toBe(true);
    expect(isOwnVendorCardPath(A, `${A}/x/${U}.webp`)).toBe(false);
  });
});

describe("원청 기본값 상속", () => {
  const vendor = { default_hold: { deposit_pct: 0.3, days: 7 }, default_sample_ok: true, default_label_options: [{ type: "main_label" }], default_mod_options: [] };
  it("override 없으면 원청 값, 있으면 override", () => {
    const a = resolveInherited({ hold_override: null, label_options_override: null, mod_options_override: null, sample_ok: null }, vendor);
    expect(a.hold).toEqual({ deposit_pct: 0.3, days: 7 });
    expect(a.holdResolved).toBe(true);
    expect(a.inherited.hold).toBe(true);
    const b = resolveInherited({ hold_override: { none: true }, label_options_override: [], mod_options_override: null, sample_ok: false }, vendor);
    expect(b.hold).toEqual({ none: true });
    expect(b.labelOptions).toEqual([]);
    expect(b.sampleOk).toBe(false);
  });
  it("원청도 상품도 홀딩이 없으면 미해결", () => {
    expect(resolveInherited({ hold_override: null, label_options_override: null, mod_options_override: null, sample_ok: true }, null).holdResolved).toBe(false);
  });
});

describe("공개 조건 (productPublishChecks)", () => {
  const product = {
    verified_in_person: true, sample_ok: true, fabric: [{ pct: 95 }, { pct: 5 }], origin: "CN", care_codes: ["dry"], min_qty: 30, weight_g: 480,
    supply_type: "stock", vendor_id: "v", lead_days: null, production_moq: null, hold_override: null, label_options_override: null, mod_options_override: null,
  };
  const vendor = { default_hold: { none: true }, default_sample_ok: true, default_label_options: [], default_mod_options: [] };
  const img = (kind: string, source: string) => ({ kind, source });
  const five = [img("real", "own"), img("model", "vendor"), img("detail", "own"), img("detail", "vendor"), img("label", "own")];
  it("다 갖추면 검수 요청 가능", () => {
    expect(canRequestReview(productPublishChecks({ product, vendor, images: five, colorCount: 1, sizeCount: 1, costTierCount: 1 }))).toBe(true);
  });
  it("참고용 사진은 세지 않는다 — 5장·실물컷은 권장, 1장은 필수", () => {
    const at = (images: typeof five) => productPublishChecks({ product, vendor, images, colorCount: 1, sizeCount: 1, costTierCount: 1 });
    const ref = [...five.slice(0, 4), img("detail", "reference")];
    expect(at(ref).find((c) => c.key === "photos")?.ok).toBe(false);
    expect(canRequestReview(at(ref)), "권장 미충족은 막지 않는다").toBe(true);
    const noReal = five.map((i) => (i.kind === "real" ? img("model", "own") : i));
    expect(at(noReal).find((c) => c.key === "photos")?.ok).toBe(false);
    expect(canRequestReview(at([img("detail", "vendor")]))).toBe(true);
    expect(canRequestReview(at([img("detail", "reference")])), "참고용만 있으면 사진 0장").toBe(false);
  });
  it("홀딩은 원청 상속으로 충족, 원청 없으면 미충족", () => {
    const checks = productPublishChecks({ product: { ...product, vendor_id: null }, vendor: null, images: five, colorCount: 1, sizeCount: 1, costTierCount: 1 });
    expect(checks.filter((c) => !c.ok).map((c) => c.key).sort()).toEqual(["hold", "vendor"]);
  });
  it("혼용률 합 100 (소수 허용)", () => {
    expect(fabricSum([{ pct: 33.3 }, { pct: 33.3 }, { pct: 33.4 }])).toBe(100);
    const checks = productPublishChecks({ product: { ...product, fabric: [{ pct: 90 }] }, vendor, images: five, colorCount: 1, sizeCount: 1, costTierCount: 1 });
    expect(checks.find((c) => c.key === "fabric")?.ok).toBe(false);
  });
});

describe("공개 상품 수정 가드 (B1: 충족했던 조건을 깨는 저장만 거부)", () => {
  const product = {
    verified_in_person: true, sample_ok: true, fabric: [{ pct: 100 }], origin: "CN", care_codes: ["dry"], min_qty: 30, weight_g: 480,
    supply_type: "stock", vendor_id: "v", lead_days: null, production_moq: null, hold_override: null, label_options_override: null, mod_options_override: null,
  };
  const vendor = { default_hold: { none: true }, default_sample_ok: true, default_label_options: [], default_mod_options: [] };
  const img = (kind: string, source: string) => ({ kind, source });
  const five = [img("real", "own"), img("model", "vendor"), img("detail", "own"), img("detail", "vendor"), img("label", "own")];
  const checks = (o: { images?: typeof five; colorCount?: number; sizeCount?: number }) =>
    productPublishChecks({ product, vendor, images: o.images ?? five, colorCount: o.colorCount ?? 1, sizeCount: o.sizeCount ?? 1, costTierCount: 1 });

  it("미달 상태(색상·사이즈 0)에서 색상 추가 → 허용 (데드락 해소)", () => {
    const before = checks({ colorCount: 0, sizeCount: 0 });
    const after = checks({ colorCount: 2, sizeCount: 0 });
    expect(canRequestReview(after), "저장 후에도 사이즈가 없어 여전히 미달").toBe(false);
    expect(brokenPublishChecks(before, after)).toEqual([]);
    expect(publishedEditError("reviewed", before, after)).toBeNull();
  });
  it("미달 상태에서 상관없는 필드 저장(아무 조건도 안 바뀜) → 허용", () => {
    const before = checks({ colorCount: 0, sizeCount: 0 });
    expect(publishedEditError("offering", before, before)).toBeNull();
  });
  it("사진 5 → 4장은 권장 조건만 깨므로 허용, 마지막 사진 삭제(필수)는 거부", () => {
    const before = checks({});
    expect(publishedEditError("reviewed", before, checks({ images: five.slice(0, 4) }))).toBeNull();
    expect(brokenPublishChecks(before, checks({ images: [] }))).toEqual(["photo"]);
    expect(publishedEditError("reviewed", before, checks({ images: [] }))).toBe("product.error.wouldBreakChecks");
  });
  it("미달 상태라도 충족했던 다른 필수 조건(사진)을 깨면 거부", () => {
    const before = checks({ colorCount: 0 });
    const after = checks({ colorCount: 0, images: [] });
    expect(brokenPublishChecks(before, after)).toEqual(["photo"]);
    expect(publishedEditError("repool", before, after)).toBe("product.error.wouldBreakChecks");
  });
  it("공개 전(draft·rejected) 상품은 가드 없음", () => {
    expect(publishedEditError("draft", checks({}), checks({ images: [] }))).toBeNull();
  });
});

describe("수정 판정 (리뷰: 보낸 키가 아니라 실제 변경)", () => {
  it("같은 값은 변경 아님, jsonb도 값으로 비교", () => {
    const cur = { supply_type: "stock", lead_days: null, hold_override: { none: true }, fabric: [{ material_code: "polyester", pct: 100 }] };
    expect(changedColumns(cur, { supply_type: "stock", lead_days: null, hold_override: { none: true } })).toEqual([]);
    expect(changedColumns(cur, { supply_type: "production", fabric: [{ material_code: "polyester", pct: 100 }] })).toEqual(["supply_type"]);
  });
  it("jsonb 키 순서가 달라도 같은 값 (DB {days,deposit_pct} vs zod {deposit_pct,days})", () => {
    expect(changedColumns({ hold_override: { days: 7, deposit_pct: 0.3 } }, { hold_override: { deposit_pct: 0.3, days: 7 } })).toEqual([]);
    expect(changedColumns({ fabric: [{ pct: 100, material_code: "polyester" }] }, { fabric: [{ material_code: "polyester", pct: 100 }] })).toEqual([]);
  });
  it("원가 구간 순서만 다르면 같음", () => {
    expect(tiersEqual([{ min_qty: 100, cost_cny: 68 }, { min_qty: 10, cost_cny: 73 }], [{ min_qty: 10, cost_cny: 73 }, { min_qty: 100, cost_cny: 68 }])).toBe(true);
    expect(tiersEqual([{ min_qty: 10, cost_cny: 73 }], [{ min_qty: 10, cost_cny: 72 }])).toBe(false);
  });
});

describe("재확인 (PRD D16)", () => {
  it("공개 이후 원가·공급 조건 변경 → recheck, 사진·설명 변경은 아님", () => {
    expect(recheckReason("offering", ["costTiers", "descZh"])).toBe("costTiers");
    expect(recheckReason("reviewed", ["supplyType", "leadDays"])).toBe("supplyType,leadDays");
    expect(recheckReason("offering", ["descZh", "careCodes"])).toBeNull();
  });
  it("임시저장·반려 상태에서는 재확인 없음, 검수 대기 중엔 수정 불가", () => {
    expect(recheckReason("draft", ["costTiers"])).toBeNull();
    expect(recheckReason("rejected", ["costTiers"])).toBeNull();
    expect(isEditableByCn("pending_review")).toBe(false);
    expect(isEditableByCn("draft")).toBe(true);
  });
});

describe("variant 동기화 · 실측 범위 · 상세 입력", () => {
  it("컬러 × 사이즈 차이만 추가·삭제", () => {
    const r = syncVariants([{ id: "c1" }, { id: "c2" }], [{ id: "s1" }], [{ id: "v1", color_id: "c1", size_id: "s1" }, { id: "v9", color_id: "c9", size_id: "s1" }]);
    expect(r.insert).toEqual([{ color_id: "c2", size_id: "s1" }]);
    expect(r.remove).toEqual(["v9"]);
  });
  it("실측 범위 밖·모르는 부위", () => {
    expect(measurementErrors({ length: 65, chest: 55 })).toEqual([]);
    expect(measurementErrors({ length: 5, foo: 3 })).toEqual(["length", "foo"]);
  });
  it("소재·세탁은 코드만 받는다 (번역 없음)", () => {
    expect(ProductDetailInput.safeParse({ fabric: [{ material_code: "polyester", pct: 100 }], careCodes: ["dry"] }).success).toBe(true);
    expect(ProductDetailInput.safeParse({ fabric: [{ material_code: "涤纶", pct: 100 }] }).success).toBe(false);
    expect(ProductDetailInput.safeParse({ careCodes: ["干洗"] }).success).toBe(false);
  });
});

describe("코드 사전", () => {
  it("코드 중복 없음, ko·zh 모두 있음", () => {
    for (const list of [MATERIALS, CARE, MEASUREMENTS]) {
      expect(new Set(list.map((x) => x.code)).size).toBe(list.length);
      for (const x of list) expect(x.ko && x.zh, x.code).toBeTruthy();
    }
  });
  it("기본 카테고리 전부 zh 라벨, 실측 템플릿 부위는 사전에 있음", () => {
    for (const c of DEFAULT_CATEGORIES) expect(CATEGORY_ZH[c], c).toBeTruthy();
    for (const parts of Object.values(MEASUREMENT_TEMPLATE)) for (const p of parts) expect(MEASUREMENTS.some((m) => m.code === p), p).toBe(true);
  });
});
