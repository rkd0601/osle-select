# Claude Code 다음 작업 (2026-11-01 r3 → 6단계 착수)

> `/next` 로 실행. 아래를 위에서부터 순서대로, 멈추지 말고.

## 0. Cowork r3 반영 수용 (10분)
- `docs/REVIEW_2026-11-01_r3.md` 읽기. `git status`로 Cowork 변경 14개 파일 확인.
- 게이트: `pnpm test`(102) · `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm build` · `pnpm db:check`(17/17; Docker 없으면 `db:check:lite`).
- 커밋 2개: (a) `fix(db): 0020 r3 보안 — CN offers 직접 조회 차단(cn_owns_offer), 발행 트리거 코드만, issue_offer_locked service_role grant` (b) `fix(offers): D16 우회 차단, hide 재집계, 반려 메모 CN 전달, KST 날짜, 재승인 고정값 갱신, offerType 브랜드 기준`.
- 참고: `seed.sql` 상품 1이 `offering`(트리거가 상태를 안 바꾸므로 시드가 결과 상태를 든다). 다음 마이그레이션 번호는 **0021**부터(0018·0019도 비어 있으니 써도 됨, 0020만 피할 것).

## 1. 결정 반영 (5단계 꼬리)
`docs/COWORK_DECISIONS.md` "r3 — STEP5 질문 5건" 중 **Q5**: 추천(recommend) 제안에 브랜드가 관심을 누르면 그 시점부터 `exclusive_until = today + exclusive_days` 부여 — `app/b/[slug]/offers/actions.ts#reactToOffer` patch에 한 줄 + 단위 테스트 1개.

## 2. 6단계 샘플 구현 (B-06 · B-07 · C-05 · A-05)
`docs/STEP6_NOTES.md` 계획 + DECISIONS "STEP6 착수 전 질문 4건 + 보정" 기준. 요점:
- **담기 조건**: offer `interested`만. `hold`는 담는 순간 `hold → interested` 전이(같은 액션, canPurchase). `new`·`reconsent_pending`·recheck·만료 불가.
- **B-06 요청서**: 제안별 variant 매트릭스 **숫자 입력**(기본 1, 최대 `settings.sample_qty_max`=3, 합 0이면 제출 불가), 수령 주소, 물류비 **한 금액**(국내 배송 1회 + 특송 Σ qty×weight/1000×kg당 — `sampleLogisticsFeeKrw`) + "회수하지 않으면 상품가 ₩N 청구" 안내, 회수 원칙 체크. `brands.tier='new'` → `awaiting_payment` + **입금 안내 카드**(settings `bank_account`·`deposit_days`=3, 템플릿 키 `payment.notice.*`), `proven` → 바로 `cn_preparing`.
- **A-05**: 입금 확인(감사 로그 `payment.confirm`), 위아더 도착, variant별 검품(OK/불량 템플릿 + 사진 + 실측 → `product_sizes.source='measured'`), 브랜드 발송 운송장, 회수 접수, **미회수 확정은 수동 버튼**(`return_status='charged'` + 브랜드 알림 + 감사 로그). "기한 경과" 섹션만 자동 표시.
- **B-07**: 타임라인, 도착 후 variant별 피드백(관심/보류/거절 + 사유 템플릿·번역) → `sync_offer_reaction_from_sample`(0010), 회수 신청(반납 운송장)/보유 선택, 청구 예정 금액. "발주서에 담기"는 비활성 + 조건 안내(절대 규칙 7).
- **C-05** `/cn/tasks`: 출고 대기(입금 확인 전엔 버튼 없음) → 운송장 입력 → `cn_shipped`, 브랜드 반응·거절 사유(zh), 기한 순. CN_VENDOR 마스킹은 뷰 `v_sample_items_cn`.
- **DB**: 0021 스키마(`sample_items.library_location`, 필요 컬럼) / 0022 뷰·권한(`v_sample_requests_brand`·`v_sample_items_brand`·`v_sample_items_cn`, 내부 메모 제외) 분리 커밋. SQL 체크 18~: 브랜드 뷰 금지 키 없음, CN 마스킹, member(can_purchase=false)는 샘플 요청 생성 불가, 결제 관련 테이블에 PG 필드 없음.
- **공통 컴포넌트 8/8**: `components/domain/variant-matrix.tsx`, `payment-notice-card.tsx`.
- **절대 규칙 13**: 결제·PG·세금계산서 코드 금지. 입금 "신고"와 "확인 플래그"까지만.

## 3. 마감 → 다음 단계
- `docs/STEP6_NOTES.md`에 "한 일 / 안 한 일 / 질문". 게이트 통과 커밋.
- 기다리지 말고 `docs/STEP7_NOTES.md`(발주: 재고 확인 → 선금 → 홀딩 → 범위 견적 → 수량 확정 → 최종 견적 → 확정 → 미송 → 검품 → 검수 보고; 전이 테이블 `order` 체인, `canAddToOrder`, `orderTotals`·`depositKrw`·`logisticsEstimateKrw`) 계획을 쓰고 착수한다. Cowork 4라운드 리뷰는 병렬로 들어온다.
