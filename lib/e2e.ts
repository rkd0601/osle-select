/**
 * E2E·시험 데이터 이름 규칙 (COWORK_DECISIONS d-23). E2E는 고정 이름("E2E 브랜드", "E2E 测试商品")을 find-or-create 하고 끝나면 숨김 전이.
 * 관리자 선택 목록 정렬과 정리 스크립트(scripts/cleanup-e2e.ts)가 같은 접두어를 쓴다. 순수 함수(서버·스크립트 공용).
 */
export const E2E_PREFIX = "E2E ";
export const E2E_BRAND_NAME = "E2E 브랜드";
export const E2E_PRODUCT_NAME = "E2E 测试商品";

export const isE2EName = (name: string | null | undefined): boolean => !!name && name.startsWith(E2E_PREFIX);

/** 관리자 브랜드 선택 목록(제안 발행·대행 요청): 숨김 제외 → 실브랜드 먼저(이름 순) → "E2E "로 시작하는 이름은 맨 뒤 */
export function pickerBrands<B extends { name: string; status?: string | null }>(list: B[]): B[] {
  return list
    .filter((b) => b.status !== "hidden")
    .sort((a, b) => Number(isE2EName(a.name)) - Number(isE2EName(b.name)) || a.name.localeCompare(b.name, "ko"));
}
