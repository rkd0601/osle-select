import { originText, type ShopMapping } from "./common";

/**
 * 아임웹 상품 일괄 등록 CSV. 옵션은 "색상:블랙,아이보리/사이즈:S,M". 헤더는 실제 양식과 대조 필요(STEP9 질문 5).
 */
export const imweb: ShopMapping = {
  shop: "imweb",
  version: "2026-11-draft",
  fileName: "imweb_products.csv",
  headers: ["상품코드", "상품명", "판매가", "옵션", "간단설명", "상세설명", "원산지", "대표이미지", "추가이미지", "판매상태"],
  rows: (p, detailFile) => {
    const opt = [p.colors.length ? `색상:${p.colors.join(",")}` : "", p.sizes.length ? `사이즈:${p.sizes.map((s) => s.label).join(",")}` : ""].filter(Boolean).join("/");
    return [[p.code, p.name, "", opt, p.desc?.split("\n")[0] ?? "", `(${detailFile})`, originText(p), p.images[0] ?? "", p.images.slice(1).join(","), "숨김"]];
  },
};
