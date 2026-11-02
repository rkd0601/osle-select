import { originText, type ShopMapping } from "./common";

/**
 * 네이버 스마트스토어 상품 일괄 등록. 공식 양식은 xlsx — MVP는 같은 컬럼 순서의 CSV(UTF-8 BOM)로 내고 xlsx 변환 여부는 STEP9 질문 1.
 * 조합형 옵션: 옵션명 "색상\n사이즈", 옵션값 "블랙,아이보리\nS,M". 헤더는 실제 양식과 대조 필요(STEP9 질문 5).
 */
export const smartstore: ShopMapping = {
  shop: "smartstore",
  version: "2026-11-draft",
  fileName: "smartstore_products.csv",
  headers: ["판매자 상품코드", "상품명", "판매가", "재고수량", "옵션형태", "옵션명", "옵션값", "대표 이미지 파일명", "추가 이미지 파일명", "상세설명", "원산지", "상품상태"],
  rows: (p, detailFile) => {
    const names = [p.colors.length ? "색상" : "", p.sizes.length ? "사이즈" : ""].filter(Boolean);
    const values = [p.colors.length ? p.colors.join(",") : "", p.sizes.length ? p.sizes.map((s) => s.label).join(",") : ""].filter(Boolean);
    return [[p.code, p.name, "", "", names.length ? "조합형" : "", names.join("\n"), values.join("\n"), p.images[0] ?? "", p.images.slice(1).join(","), `(${detailFile})`, originText(p), "신상품"]];
  },
};
