# Claude Code 다음 작업 (2026-11-02 r7 → 9단계 마감 · 10단계)

> 멈추지 말고 위에서부터.

## 0. Cowork r7 수용
- `docs/REVIEW_2026-11-02_r7.md` → `git status` → 게이트(vitest 178 · tsc · eslint · build · db:check 30/30) → 커밋 2개: (a) `fix(db): 0045 brand_applications anon 직접 insert 차단` (b) `fix(exports,apply): CSV 수식 주입, 패키지 상한·실패 기록·maxDuration, 신청 폼 홍수·honeypot 조용히·https, A-07 channels 방어`. (comments 차단·크레딧 멱등·선택지 순서는 네 0041/0042를 채택했다.)
- `docs/COWORK_DECISIONS.md` "r7" 표 전부 읽기.

## 1. 9단계 마감 — **B-12는 위아더 표준 패키지로 (Jay 결정)**
- `docs/EXPORT_PACKAGE_SPEC.md` v1 그대로 구현: `lib/exports/osle.ts`(products.csv 20컬럼 고정 순서 · options.csv SKU 제안 · sizes.csv 실측 부위 · README 대응표), 기존 4개 쇼핑몰 매핑은 `lib/exports/presets/`로 이동 + "참고용(초안)" 라벨, B-12 기본 선택 = 표준. 사진은 `source='own'` + `usable_for_sales` → `sharp` JPG. 테스트: 헤더·순서 스냅샷, SKU 규칙, 실측 매핑, 금지 키.
- DECISIONS 9-6 `sharp`(JPG 변환) · 9-7 발주 확정 시 패키지 상품 스냅샷(0041+) · r7-13 사진 `source='own'`만 · r7-11 조건 변경 안내 · r7-12 정지 브랜드 알림 제외 · 8-9 코멘트 알림 묶기 · 8-10 타임라인 1줄 · LOW i18n·승인 실패 brandId.
- 스마트스토어 xlsx는 양식 파일이 `docs/shop-templates/`에 들어온 뒤(없으면 CSV 유지, 메모만).
- `docs/STEP9_NOTES.md` 마감.

## 2. 10단계 (관리자 설정·용어 사전·감사 로그·브랜드 설정)
- **A-08 설정**: settings 키 전부(환율·마진·수수료·샘플 특송·국내 배송·물류 추정·통관·기간 규칙·카테고리·반려 템플릿·계좌) 편집 화면. **환율 변경 = 감사 로그 `settings.fx_update` + 즉시 `fxJob`**(DECISIONS r6-3). 마진·수수료 변경 감사 로그(절대 규칙 12). 변경은 서버 액션 + 서비스 롤(0005가 settings를 revoke했는지 확인).
- **용어 사전**: 승인 대기 목록(검수 중 추가된 미승인 용어), 승인/수정/삭제, 번역 시 approved만 주입 확인.
- **감사 로그 화면**: 필터(행위자·대상·기간·액션), 대행(on_behalf) 강조, 돈 관련 액션(price.*·payment.*·order.confirm·order.credit·settings.*) 탭.
- **B-10 브랜드 설정**: 멤버 초대/권한(can_purchase)/제거(owner만), 기본 주소, digest 수신 설정(DECISIONS r6-2), slug 변경 요청(관리자 승인, 9-8).
- **E2E 묶음(Playwright)**: 원가 누출 전 라우트 순회(브랜드 세션, 금지 키 스캔 + B-12 다운로드 내용), 브랜드 A→B 404 전수, 공개 조건 거부, A-07 승인→초대 수락. `E2E_BASE_URL` 없으면 skip 유지하되 로컬 Supabase로 돌릴 수 있게 `pnpm e2e:local` 스크립트.
- 마감 → `docs/STEP10_NOTES.md` → 11단계(디자인 토큰 라운드·접근성·성능) 계획.
