import { cafe24 } from "./cafe24";
import { godo } from "./godo";
import { imweb } from "./imweb";
import { smartstore } from "./smartstore";
import { detailHtml, leaks, toCsv, type ExportProduct, type ShopMapping, type ShopType } from "./common";
import { zipStore } from "./zip";

export type { ExportProduct, ShopType } from "./common";
export const SHOPS: Record<ShopType, ShopMapping> = { cafe24, godo, imweb, smartstore };
export const SHOP_TYPES = Object.keys(SHOPS) as ShopType[];

/**
 * 패키지 본문 (순수): CSV 1개 + 상세 HTML(상품별) + 이미지(호출부가 바이트를 채움) → zip.
 * CSV의 상세설명 칸에는 같은 zip 안의 HTML 파일명을 넣는다 — 쇼핑몰에 붙여 넣을 원본.
 */
export function buildPackage(shop: ShopType, products: ExportProduct[]) {
  const m = SHOPS[shop];
  const details = products.map((p) => ({ name: `detail/${p.code}.html`, text: detailHtml(p) }));
  const csv = toCsv(m.headers, products.flatMap((p) => m.rows(p, `detail/${p.code}.html`)));
  const bad = [csv, ...details.map((d) => d.text)].some(leaks);
  return { csvName: m.fileName, csv, details, version: m.version, leak: bad };
}

export function packageZip(pkg: ReturnType<typeof buildPackage>, images: { name: string; bytes: Uint8Array }[]) {
  const enc = new TextEncoder();
  return zipStore([
    { name: pkg.csvName, bytes: enc.encode(pkg.csv) },
    ...pkg.details.map((d) => ({ name: d.name, bytes: enc.encode(d.text) })),
    ...images,
  ]);
}
