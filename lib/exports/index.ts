import { cafe24 } from "./presets/cafe24";
import { godo } from "./presets/godo";
import { imweb } from "./presets/imweb";
import { smartstore } from "./presets/smartstore";
import { leaks, toCsv, type ExportProduct, type ShopMapping, type ShopType } from "./common";
import { OSLE_SPEC_VERSION, standardFiles, type StandardOptions } from "./osle";
import { zipStore } from "./zip";

export type { ExportProduct, ShopType } from "./common";
/** 쇼핑몰 프리셋 — 참고용(초안). B-12 기본은 표준 패키지(osle.ts), 프리셋은 체크한 것만 zip 안 presets/에 더한다 */
export const SHOPS: Record<ShopType, ShopMapping> = { cafe24, godo, imweb, smartstore };
export const SHOP_TYPES = Object.keys(SHOPS) as ShopType[];

export function presetCsv(shop: ShopType, products: ExportProduct[]) {
  const m = SHOPS[shop];
  return { name: `presets/${m.fileName}`, text: toCsv(m.headers, products.flatMap((p) => m.rows(p, `detail/${p.code}.html`))) };
}

/**
 * 패키지 본문 (순수): 표준 패키지(README·products·options·sizes·상세 HTML) + 고른 프리셋 CSV. 이미지는 호출부가 바이트를 채운다.
 * 산출물 전체를 한 번 더 누출 검사한다(원가·원청·중국어).
 */
export function buildPackage(products: ExportProduct[], o: StandardOptions = {}) {
  const files = [...standardFiles(products, o), ...(o.presets ?? []).map((s) => presetCsv(s, products))];
  return {
    files,
    productsCsv: files.find((f) => f.name === "products.csv")!.text,
    version: OSLE_SPEC_VERSION,
    leak: files.some((f) => leaks(f.name) || leaks(f.text)),
  };
}

export function packageZip(pkg: ReturnType<typeof buildPackage>, images: { name: string; bytes: Uint8Array }[]) {
  const enc = new TextEncoder();
  return zipStore([...pkg.files.map((f) => ({ name: f.name, bytes: enc.encode(f.text) })), ...images]);
}

/** osle_package_{브랜드slug}_{YYYYMMDD}.zip (규격 v1) */
export const packageZipName = (slug: string, date: string) => `osle_package_${slug}_${date.replaceAll("-", "")}.zip`;
