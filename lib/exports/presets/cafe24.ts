import { originText, type ShopMapping } from "../common";

/**
 * 카페24 상품 일괄 등록 CSV. 옵션은 조합형 "색상{블랙|아이보리}//사이즈{S|M}".
 * version: 양식이 바뀌면 올리고 매핑 테스트를 고친다 (PRD 10장 "버전 관리"). 참고용(초안) 프리셋 — 표준 패키지(osle.ts)가 기본, 헤더는 실제 양식 받은 뒤 대조(DECISIONS 9-5).
 */
export const cafe24: ShopMapping = {
  shop: "cafe24",
  version: "2026-11-draft",
  fileName: "cafe24_products.csv",
  headers: ["자체 상품코드", "상품명", "상품 요약설명", "상품 상세설명", "판매가", "옵션사용", "품목 구성방식", "옵션 입력", "원산지", "이미지등록(상세)", "이미지등록(추가)", "진열상태", "판매상태"],
  rows: (p, detailFile) => {
    const opt = [p.colors.length ? `색상{${p.colors.join("|")}}` : "", p.sizes.length ? `사이즈{${p.sizes.map((s) => s.label).join("|")}}` : ""].filter(Boolean).join("//");
    return [[p.code, p.name, p.desc?.split("\n")[0] ?? "", `(${detailFile})`, "", opt ? "Y" : "N", opt ? "T" : "", opt, originText(p), p.images[0] ?? "", p.images.slice(1).join("|"), "N", "N"]];
  },
};
