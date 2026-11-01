# 6단계 노트 — 샘플 (B-06 · B-07 · C-05 · A-05)

Claude Code(개발) → Cowork(기획·검증). 기준: 기획서 §5 샘플·§7 샘플비·§10 F5·§11 입금 안내, PRD D13·4·7·12장, COWORK_DECISIONS "다음 단계 예고", CLAUDE.md 절대 규칙 7·13.

## 계획 (착수 전 — Cowork 검토 요청)

### 데이터
- 스키마는 0002에 있음(`sample_requests`, `sample_items`). 추가 후보(0018, 스키마): `sample_items.brand_id`(RLS용, 0003 정책이 참조 — 있는지 확인), `sample_requests.payment_*` 이미 있음, `sample_library`(회수 샘플 보관 위치·재제안 가능) → `sample_items.library_location text`로 최소화.
- 0019(뷰·권한): `v_sample_requests_brand`·`v_sample_items_brand`(검품 내부 메모·CN 출고 운송장 원본 제외 여부 확인), CN은 본인 상품 라인만(브랜드 마스킹 — CN_VENDOR).

### 순수 로직 (테스트 필수)
- `lib/samples.ts`: 요청서 입력 검증(variant별 수량 1~`sample_qty_max`, 합 ≥1, 샘플 불가·품절 칸 비활성, 발주서 담기 조건과 별개 — 샘플은 offer `interested`/`hold`/`new`에서 가능?), 금액(`sampleLogisticsFeeKrw` 묶음 1회 국내 배송 + Σ특송, 미회수 시 상품가 `sampleProductFeeKrw`), 결제 게이트(브랜드 tier `new` → `awaiting_payment` 후 출고, `proven` → 바로 출고), 피드백·회수 기한(`sample_feedback_days`·`sample_return_days`), 미회수 청구 판정(`return_due` 경과 + 미반납 → `charged`), 발주 시 차감 1회(`deducted_in_order_id`).
- 전이: `sample_request` 테이블 그대로(구매 전이는 `canPurchase`). `sample_items.feedback` → `sync_offer_reaction_from_sample` 트리거(0010에서 반응 가능 상태만).

### 화면·액션
- **B-06** `/b/{slug}/samples/new?offers=`: 관심 제안 담기 → 제안별 variant 매트릭스(**숫자 입력**, 기본 1, 행·열 합계), 수령 주소 기본값, 물류비 한 금액 + 미회수 시 상품가 안내, 회수 원칙 고지 체크. 신규 등급이면 **입금 안내 카드**(계좌·금액·기한·미입금 시 결과) + "입금했어요". B-05 "샘플 요청서에 담기" 활성화.
- **B-07** `/b/{slug}/samples`·`[id]`: 진행 타임라인, 도착 후 variant별 피드백(관심/보류/거절 + 사유) → 제안 반응 동기화, 회수 신청(반납 운송장 입력)·보유 선택, 청구 예정 금액.
- **C-05** `/cn/tasks`: 샘플 출고 대기(운송장 입력 → `cn_shipped`, 입금 확인 전에는 버튼 없음), 재확인 요청, 브랜드 반응·거절 사유(zh). 기한 순.
- **A-05** `/admin/samples`: 입금 확인(감사 로그), 위아더 도착 처리, variant별 검품(OK/불량 템플릿 + 사진 1장 + 실측 보완 → `product_sizes.source=measured`), 브랜드 발송 운송장, 회수 접수·미회수 청구 처리, 샘플 라이브러리.
- 공통 컴포넌트 8/8: **variant 매트릭스**, **입금 안내 카드**.

### 질문 (착수 전)
1. 샘플 요청서에 담을 수 있는 제안 상태: `new`·`interested`·`hold` 전부? (추천: `interested`·`hold`만 — "관심 제안들을 묶어", 기획서 §4-5)
2. 국내 배송비는 요청서당 1회, 특송은 variant 수량 × 중량 합 — 맞나? (PRD 7 `sample_logistics_fee` 식 그대로)
3. 입금 계좌·입금 기한(`deposit_days` 3일) 문구는 settings에 `bank_account` 키를 추가해 템플릿으로?
4. 회수 기한 경과 후 미회수 청구는 관리자 버튼(수동) vs 배치 자동? (추천: A-05 큐에 "기한 경과"로 띄우고 관리자 확인 — 돈은 수동 원칙)
