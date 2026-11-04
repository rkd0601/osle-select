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

## 1. 개발자 범위 (NEXT가 아니라 DEVELOPER_HANDOVER §4 — 참고용 목록)
- VERIFICATION §4 LOW 15(전부 S) → 운영 전 일괄.
- G1 B-01 홈 완성(v-9), G2~G8.
- v-1 2차: 예약 시 가격 스냅샷(0054).
- 스테이징 E2E 9/9(시드 보강: 원청 계정·발주 확정 상품), Preview 환경변수 + `e2e.yml`.
