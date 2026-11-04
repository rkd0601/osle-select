# Claude Code 다음 작업 (2026-11-04 전체 검증 반영)

> 사람 개발자와 같이 쓰는 저장소다. **GitHub 원격(`rkd0601/osle-select`)과 충돌하지 않게 먼저 `git fetch` → 최신 위에서 작업.** 아래 §0만 하고 멈춘다(그 뒤는 개발자 범위 — `docs/DEVELOPER_HANDOVER.md`).

## 0. Cowork 전체 검증 수용 (`docs/VERIFICATION_2026-11-04.md`)
- 게이트(vitest 215 · tsc · eslint · build · db:check 39/39 · db:check:lite) → 커밋 2개: (a) `fix(db): 0053 초대 insert·검품 select 세션 차단, issue_order_credit RPC + SQL 39` (b) `fix(orders,exports): 재동의 전 돈 단계 차단(offerChanged), 크레딧 RPC 호출, 스냅샷 enum 제외; chore: *.zip ignore`.
- 루트의 `osle-select 로컬 셋팅.zip`은 저장소 밖으로(커밋 금지).
- `docs/COWORK_DECISIONS.md` "2026-11-04 전체 검증" 표. 다음 마이그레이션 번호 **0054**.

## 0-b. Cowork UX 검토 반영 (`docs/UX_REVIEW_2026-11-04.md`, 2026-11-04 오후)
- 이미 디바이스에 반영됨(수정 시각 가드): `lib/db/brand/settings.ts`, `lib/db/admin/brands.ts`, `app/admin/brands/[id]/page.tsx`, `lib/i18n/ko.admin.json`, `app/admin/requests/[id]/page.tsx`, `app/b/[slug]/exports/actions.ts`, `app/b/[slug]/exports/export-form.tsx`, `lib/handoff.ts`, `app/b/[slug]/orders/[id]/page.tsx`, `app/b/[slug]/page.tsx`, `lib/db/brand/orders.ts`, `lib/i18n/ko.json`(`login.dev.*` 보존·병합).
- 게이트 후 커밋 1개: `fix(B-01,B-10,A): 홈 완성·멤버 목록 복구·선금 신고 핸드오프·최종 견적 미리보기·패키지 사진 경고 (UX_REVIEW_2026-11-04)`.
- **2차(같은 날 오후)도 반영됨**(UX_REVIEW §6, U8~U20): `app/b/[slug]/layout.tsx`, `app/b/[slug]/orders/new/page.tsx`·`order-form.tsx`, `app/b/[slug]/orders/[id]/page.tsx`, `app/b/[slug]/requests/[id]/page.tsx`, `app/b/[slug]/settings/settings-forms.tsx`, `app/admin/orders/[id]/admin-order-controls.tsx`, `app/admin/offers/[id]/page.tsx`, `app/admin/page.tsx`, `lib/db/admin/dashboard.ts`, `lib/db/admin/requests.ts`, `app/cn/page.tsx`, `lib/i18n/ko.json`·`ko.admin.json`. 커밋 문구에 "2차: 모바일 메뉴·단가 기준 통일·대시보드 건수·CN 큐 요약" 추가.
- 코드 추가 작업 없음. UX_REVIEW §3·§8(P1~P15)은 DEVELOPER_HANDOVER §4, P1·P9·P12·P14는 Jay 결정 대기.

## 0-d. 디자인 v2.2 델타 (Jay 2026-11-04 저녁 · `docs/DESIGN_SPEC_v2.md` v2.1 · 프로토타입 "홈·진행·청구·제안 상세·모바일" 화면 · DECISIONS d-6~d-9)
§0-c(STEP15, 커밋 0b6ba2b까지)는 수용 — 그 위에 **구조 변경**만 얹는다. **v2.2가 기준**(스펙 머리 "v2.2" 문단과 §1·§4·§5의 v2.2 표기): 브랜드 화면에서 상태 점·5단계 트랙·체크박스·눈썹 대문자·상품 코드·#id·"내 차례/위아더 차례" 라벨을 **전부 제거**하고 사진 · 사람 말 한 문장 · 버튼만 남긴다(`StatusDot`·`HandoffCard`는 관리자·중국 전용으로; 브랜드는 `.todo`·`.nowblock`·`.pcard`). 날짜 표기 "11월 18일"(`fmtDate` 브랜드 변형). 순서대로, 단계마다 게이트 + 커밋.
1. **12칸 그리드** — `.g12`/`.c3·c4·c6·c8·c12`/`.rule-ink`를 globals에 추가하고 브랜드 모든 페이지 본문을 이 그리드 하나에 놓는다(머리 8+4 → 잉크 룰 12 → 본문). 프로토타입 "그리드 보기"와 같은 세로선. 관리자·중국은 본문 폭만 맞춘다.
2. **브랜드 메뉴 넷** — 홈 · 진행 · 청구 · 설정. `app/b/[slug]/layout.tsx` nav 교체, 640 미만 가로 메뉴도 넷. 옛 목록 라우트 `/requests`·`/offers`·`/samples`·`/orders` → `/progress?stage=…` redirect(상세 `[id]` 라우트는 그대로). `/exports` → `/billing#packages`.
3. **진행 화면** `app/b/[slug]/progress/page.tsx` — 마이그레이션 **0054 `v_progress_brand`**(request_item 기준 한 행: 요청·항목·제안(가격 tier 최소값·독점·반응)·샘플 라인 상태·발주 라인 상태·현재 단계 1~5·내 차례 여부·기한, 브랜드 definer 뷰 패턴, 원가·원청·`*_zh` 없음, SQL 체크 + brand-boundary 테스트). 화면: 필터 칩(건수) → 요청 묶음 섹션 머리 → **사진 카드**(`components/domain/photo-card.tsx`: Photo + 5단계 track + 이름 2줄 + 가격 + 상태/기한) 3칸 → 제안 카드의 "관심 · 샘플에 담기"(기존 reaction 액션 interested) → 담김 바("샘플 요청서에 n개 담김" + "샘플 요청하기" = 기존 `/samples/new?pre=` 흐름). 체크박스 없음.
4. **홈 재배치** — "할 일 n"(금색 룰) + 할 일 행(`.todo`, 64px 썸네일·문장·버튼) / 청구 예정 하나, "진행 중" 사진 카드 3칸×4(이름 + 상태 문장). 눈썹·새 제안·항목 수 패널 삭제. 상태 문장 생성은 `lib/handoff.ts` 템플릿을 브랜드용 문장 키(`state.<entity>.<status>`)로 확장.
5. **청구 화면** `app/b/[slug]/billing/page.tsx` — 청구 예정 · 납부한 선금 · 입금 계좌(설정 `bank_account`) → 발주 표 다섯 열(상품·수량·청구·지금·내역) → "쇼핑몰용 상품 파일"(기존 exports 데이터·액션 그대로).
6. **제안 상세** `offers/[id]` — 6칸 큰 사진+썸네일 5 / 6칸 메타·이름·한 문장·공급가·사실 다섯 줄·"관심 · 샘플에 담기"/"보류"/"관심 없어요". 발주 상세는 `.nowblock` + 사람 말 청구표. 목록 화면은 진행으로 대체.
7. 문구: 메뉴 키(`nav.*`) 넷, 진행·청구 신규 키. §6 규칙 유지.
- 서버 액션·권한·계산 변경 없음(뷰 추가만). 끝나면 `docs/STEP16_NOTES.md`.

## 1. 개발자 범위 (NEXT가 아니라 DEVELOPER_HANDOVER §4 — 참고용 목록)
- VERIFICATION §4 LOW 15(전부 S) → 운영 전 일괄.
- G1 B-01 홈 완성(v-9), G2~G8.
- v-1 2차: 예약 시 가격 스냅샷(0054).
- 스테이징 E2E 9/9(시드 보강: 원청 계정·발주 확정 상품), Preview 환경변수 + `e2e.yml`.
