/**
 * 상품 사진 순서 = CN 편집 화면 순서(sort_order 오름차순, 같으면 id) — 모든 브랜드 화면의 대표 사진은 이 순서의 1번(3차 검증 T4).
 * sort_order·id가 없는 행은 뒤로.
 */
export function bySortOrder(a: { sort_order?: number | null; id?: string | null }, b: { sort_order?: number | null; id?: string | null }): number {
  return (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) || (a.id ?? "").localeCompare(b.id ?? "");
}
