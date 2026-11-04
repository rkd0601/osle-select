/** C-03 블록 앵커 (바로가기 칩·모바일 하단 바 → 체크리스트). 서버 page와 클라이언트 editor가 같이 쓴다 — "use client" 모듈의 상수는 RSC에서 못 읽어서 따로 둔다 */
export const BLOCK_IDS = {
  photos: "cn-photos", basic: "cn-basic", colorsSizes: "cn-colors-sizes", material: "cn-material", supply: "cn-supply", inherit: "cn-inherit", checklist: "cn-checklist",
} as const;
