import { originText, type ShopMapping } from "./common";

/**
 * 고도몰(godomall5) 상품 일괄 등록 CSV. 옵션은 "옵션명: 색상^|^사이즈", 값은 variant 한 줄씩 "블랙^|^S" 를 "@" 로 잇는다.
 * 헤더는 실제 양식과 대조 필요(STEP9 질문 5).
 */
export const godo: ShopMapping = {
  shop: "godo",
  version: "2026-11-draft",
  fileName: "godo_products.csv",
  headers: ["상품코드", "상품명", "판매가", "정가", "옵션사용여부", "옵션명", "옵션값", "상세설명", "원산지", "대표이미지", "추가이미지", "노출여부", "판매여부"],
  rows: (p, detailFile) => {
    const names = [p.colors.length ? "색상" : "", p.sizes.length ? "사이즈" : ""].filter(Boolean);
    const values = p.variants.map((v) => [p.colors.length ? v.color : "", p.sizes.length ? v.size : ""].filter(Boolean).join("^|^")).join("@");
    return [[p.code, p.name, "", "", names.length ? "y" : "n", names.join("^|^"), values, `(${detailFile})`, originText(p), p.images[0] ?? "", p.images.slice(1).join("|"), "n", "n"]];
  },
};
