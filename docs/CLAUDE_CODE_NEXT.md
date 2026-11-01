# Claude Code 다음 작업 (2026-11-01 r4 → 7단계 계속)

> 멈추지 말고 위에서부터.

## 0. Cowork r4 수용
- `docs/REVIEW_2026-11-01_r4.md` 읽기 → `git status` → 게이트(vitest 117 · tsc · eslint · build · db:check 19/19) → 커밋 `fix(samples): r4 리뷰 — 상품가 fallback(최소 tier), 샘플 담기 시 추천 독점, 보유 버튼 숨김, 시드 계좌 null`. (출고·청구 가드·미도착은 네 01d1a13~47f4c65와 겹쳐 네 쪽을 채택했다.)
- `docs/COWORK_DECISIONS.md` "r4" 표 읽기. 거기 #3·#5~#10은 네 몫: 다음 빈 번호 마이그레이션(트리거 감사 로그 · `issue_offer_locked` KST · CN 뷰 ADMIN 언마스킹), B-06 출고처별 자동 분리 안내, B-07 만료 제안 문구, 브랜드 취소는 `payment_confirmed_at is null`일 때만, CLAUDE.md 규칙 1 주석.

## 1. 7단계 발주 (STEP7_NOTES 계획대로) — 반드시 지킬 것
- 발주 체인 순서는 전이표가 강제(절대 규칙 7): 재고 확인 → 선금 → 홀딩 → 범위 견적 → 수량 확정 → 최종 견적 → 확정 → 미송 → 검품 → 검수 보고. 구매 전이는 `canPurchase`.
- 담기 조건 `canAddToOrder`: offer `interested` AND 그 offer의 샘플 피드백 `interested`(리오더·ADMIN 면제). 서버가 거부.
- 금액은 `orderTotals`만: 소계·수수료·옵션(KRW 고정값)·**미회수 샘플 상품가 1회 차감**(`deducted_in_order_id` 기록, 이미 차감된 건 제외)·선금·크레딧(미도착 샘플 등)·최종 물류비. **proven 브랜드 샘플 물류비는 발주 확정 시 `invoice_snapshot`에 "샘플 물류비" 행으로 합산**(DECISIONS r4 #3).
- 홀딩은 선금 입금 확인(관리자, 감사 로그) 뒤에만 안내. 재고 수량은 저장하지 않는다(공급 형태만).
- 미송: 라인 단위 `backorder_*`, 위아더가 원청과 직접 관리 — 브랜드에는 "지연 N일 · 대체/대기/취소" 선택지만.
- 본품 검품: `inspections` + 기준서 = 상품 정보 필드 1:1, `info_match_rate` KPI.
- `sample_item`·`order_line` 상태를 `lib/transitions.ts`에 추가하고 전수 테스트.
- 0023~0030은 이미 있음. 다음 빈 번호부터. 뷰·권한은 별도 커밋. SQL 체크 20~: 브랜드 발주 뷰 금지 키, 체인 순서 위반 거부(DB 레벨은 아니어도 단위 테스트 전수), 입금 확인 감사 로그.

## 2. 마감 → 8단계
- `docs/STEP7_NOTES.md` 마감. 바로 `docs/STEP8_NOTES.md`(알림: Resend React Email ko/zh, WeCom webhook, 다이제스트 배치, 제안 만료·환율 ±3% 재확인·샘플 기한 경과 배치 — 전부 `notify()` 한 곳, Vercel cron) 계획 작성 후 착수.
