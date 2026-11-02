import { CARE, COLOR_EN, MATERIALS, MEASUREMENT_TEMPLATE, label } from "@/lib/codes";
import { tk } from "@/lib/i18n";
import { detailHtml, originText, toCsv, type ExportProduct, type ShopType } from "./common";

/**
 * 위아더 표준 상품 패키지 v1 (docs/EXPORT_PACKAGE_SPEC.md, DECISIONS 9-5). 쇼핑몰 양식을 따라가지 않고 이 규격 하나로 내보내고,
 * 쇼핑몰별 컬럼 대응은 README로 안내한다. 컬럼 순서는 규격 고정 — 바꾸면 SPEC 버전을 올리고 스냅샷 테스트를 고친다.
 * 판매가·재고 수량은 비운다(공급가는 어떤 파일에도 넣지 않는다, DECISIONS 9-3).
 */
export const OSLE_SPEC_VERSION = "v1";

export const PRODUCT_HEADERS = [
  "상품코드", "상품명", "카테고리", "판매가", "상품 설명", "소재", "원산지", "세탁 방법", "컬러", "사이즈",
  "옵션 조합 수", "공급 형태", "리드타임(일)", "최소 주문 수량", "실물 확인", "품질 메모", "대표 이미지", "추가 이미지", "상세 HTML", "상세 HTML(인라인)",
];
export const OPTION_HEADERS = ["상품코드", "컬러", "사이즈", "SKU 제안", "판매가", "재고수량"];
/** 실측 부위 열 순서. 규격 v1 목록에 하의 템플릿의 엉덩이(hip)를 허리 뒤에 더했다 (STEP9 노트) */
export const SIZE_PARTS = ["length", "shoulder", "chest", "sleeve", "waist", "hip", "rise", "thigh", "hem"] as const;
export const SIZE_HEADERS = ["상품코드", "사이즈", "총장", "어깨", "가슴", "소매", "허리", "엉덩이", "밑위", "허벅지", "밑단", "출처"];

const ascii = (s: string) => s.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
const nn = (i: number) => String(i + 1).padStart(2, "0");
/** SKU 컬러 조각: 사전(COLOR_EN) → 영문 이름 그대로 → 순번 C01 */
export const colorToken = (name: string, index: number) => COLOR_EN[name.replace(/\s+/g, "")] ?? (ascii(name) || `C${nn(index)}`);
/** SKU 사이즈 조각: 영문·숫자 그대로(S, M, 260) → 프리 → FREE → 순번 S01 */
export const sizeToken = (lbl: string, index: number) => ascii(lbl) || (/^(프리|free)$/i.test(lbl.trim()) ? "FREE" : `S${nn(index)}`);

/** options.csv 행: variant마다 SKU 제안 `{code}-{컬러}-{사이즈}`. 같은 조각이 겹치면 뒤에 -2, -3 */
export function optionRows(p: ExportProduct): string[][] {
  const seen = new Map<string, number>();
  return p.variants.map((v) => {
    const parts = [p.code];
    if (v.color) parts.push(colorToken(v.color, Math.max(0, p.colors.indexOf(v.color))));
    if (v.size) parts.push(sizeToken(v.size, Math.max(0, p.sizes.findIndex((s) => s.label === v.size))));
    let sku = parts.join("-");
    const n = (seen.get(sku) ?? 0) + 1;
    seen.set(sku, n);
    if (n > 1) sku = `${sku}-${n}`;
    return [p.code, v.color, v.size, sku, "", ""];
  });
}

export function productRow(p: ExportProduct, optionCount: number): string[] {
  const fabric = p.fabric.map((f) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(" / ");
  const care = p.careCodes.map((c) => label(CARE, c, "ko")).join(" / ");
  const supply = p.supplyType ? tk(`export.pkg.supply.${p.supplyType}`) : "";
  const lead = p.supplyType && p.supplyType !== "stock" && p.leadDays != null ? String(p.leadDays) : "";
  return [
    p.code, p.name, p.category ?? "", "", p.desc ?? "", fabric, originText(p), care, p.colors.join(", "), p.sizes.map((s) => s.label).join(", "),
    String(optionCount), supply, lead, p.minQty != null ? String(p.minQty) : "", tk(p.verified === false ? "export.pkg.no" : "export.pkg.yes"), p.qualityNote ?? "",
    p.images[0] ?? "", p.images.slice(1).join(";"), `detail/${p.code}.html`, detailHtml(p),
  ];
}

/** sizes.csv 행: 카테고리 실측 템플릿에 있는 부위만 채운다(템플릿 없는 카테고리는 있는 값 그대로) */
export function sizeRows(p: ExportProduct): string[][] {
  const tpl = MEASUREMENT_TEMPLATE[p.category ?? ""];
  return p.sizes.map((s) => [
    p.code, s.label,
    ...SIZE_PARTS.map((k) => (s.measurements[k] != null && (!tpl || tpl.includes(k)) ? String(s.measurements[k]) : "")),
    s.source ? tk(`export.pkg.sizeSource.${s.source}`) : "",
  ]);
}

export type StandardOptions = { presets?: ShopType[]; missingPhotos?: { code: string; n: number }[]; date?: string };

export function readme(products: ExportProduct[], o: StandardOptions): string {
  const lines = [
    tk("export.pkg.readme.title"),
    "",
    tk("export.pkg.readme.intro1"), tk("export.pkg.readme.intro2"), tk("export.pkg.readme.intro3"),
    "",
    `[${tk("export.pkg.readme.files")}]`,
    tk("export.pkg.readme.file.products", { n: products.length }), tk("export.pkg.readme.file.options"), tk("export.pkg.readme.file.sizes"),
    tk("export.pkg.readme.file.detail"), tk("export.pkg.readme.file.images"),
    ...(o.presets?.length ? [tk("export.pkg.readme.file.presets")] : []),
    "",
    `[${tk("export.pkg.readme.map")}]`,
    ...(["cafe24", "godo", "imweb", "smartstore"] as const).map((s) => tk(`export.pkg.readme.map.${s}`)),
    "",
    `[${tk("export.pkg.readme.photos")}]`,
    tk("export.pkg.readme.photosBody"),
    ...(o.missingPhotos?.length ? ["", `[${tk("export.pkg.readme.missing")}]`, ...o.missingPhotos.map((m) => tk("export.pkg.readme.missingLine", { code: m.code, n: m.n }))] : []),
    "",
    tk("export.pkg.readme.footer", { date: o.date ?? "", version: OSLE_SPEC_VERSION }),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** 표준 패키지 파일들 (순수). 이미지 바이트는 호출부가 zip에 더한다 */
export function standardFiles(products: ExportProduct[], o: StandardOptions = {}): { name: string; text: string }[] {
  const options = products.map((p) => optionRows(p));
  return [
    { name: "README.txt", text: readme(products, o) },
    { name: "products.csv", text: toCsv(PRODUCT_HEADERS, products.map((p, i) => productRow(p, options[i].length))) },
    { name: "options.csv", text: toCsv(OPTION_HEADERS, options.flat()) },
    { name: "sizes.csv", text: toCsv(SIZE_HEADERS, products.flatMap(sizeRows)) },
    ...products.map((p) => ({ name: `detail/${p.code}.html`, text: detailHtml(p) })),
  ];
}
