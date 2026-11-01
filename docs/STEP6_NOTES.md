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

---

## 마감 (2026-11-01) — 한 일
커밋: 3301179·2c9e27e(Cowork r3 수용) · a3f787c(추천 관심 독점) · 2957108(0021) · e7e6812(0022, 뷰·권한) · a99133c(로직) · 6d71ae1(액션) · e66e0de(화면)

- **Cowork r3 수용**: 게이트(vitest 102 · SQL 17/17 · tsc · eslint · build) 후 지시대로 2커밋. CLAUDE.md 협업 프로토콜 추가분 포함.
- **DECISIONS r3 Q5**: 추천 제안에 관심 → 그 시점부터 `exclusive_until = today(KST) + exclusive_days` (`exclusiveOnInterest`, 테스트 3).
- **0021** 항목 단위 고정·추적: `product_price_krw`(요청 시점 미회수 단가), 검품 사진·불량 코드·**내부 메모**·검품 시각, 반납 운송장·신청 시각, 청구 시각, 라이브러리 위치, 피드백 사유. 결제 필드 없음.
- **0022** `v_sample_requests_brand`·`v_sample_items_brand`(내부 메모·zh 제외, 대행 노출), `v_sample_items_cn`(본인 상품 라인만, CN_VENDOR 브랜드 마스킹, 브랜드 한국어 원문·주소 없음), `sample_items` 테이블 컬럼 grant + CN 직접 조회 차단. SQL 검증 18.
- **전이 1개 추가**: `awaiting_payment → requested`(ADMIN, 입금 확인). 기획 결정의 `cn_preparing`은 enum에 없어 기존 `requested`(= CN 출고 준비)로 매핑. CN은 `requested`에서만 출고 → 결제 게이트가 상태로 드러난다. 기존 테스트(입금 대기에서 CN 출고 허용) 갱신.
- **lib/samples.ts**: 담기 조건(관심, 보류는 담으며 관심 전이), 입력(variant별 0~3·합 ≥1·중복 불가·회수 동의), 금액(물류비 = 특송 Σ + 국내 1회, 미회수 시 상품가), 결제 게이트(new → awaiting_payment, proven → requested), 피드백·회수 기한(KST), 기한 경과 판정, 청구액, 닫기 조건, 불량 템플릿 코드. 테스트 12.
- **B-06** `/b/{slug}/samples/new?offers=`: 제안 선택 + variant 매트릭스(**숫자 입력**, 행·열 합계), 서버 견적(중량 비노출)으로 물류비 한 금액 + 미회수 시 상품가, 받는 곳(브랜드 기본 주소 저장·재사용), 회수 원칙 동의, 구매 권한 없으면 안내·서버 거부. B-05 "샘플 요청서에 담기" 활성화(관심·보류일 때).
- **B-07** `/b/{slug}/samples`·`[id]`: 입금 안내 카드(계좌·금액·기한·미입금 결과 템플릿 + "입금했어요" 신고), 진행 타임라인, variant별 검품 결과·사진, 피드백(관심/보류/거절 + 사유·번역 → 트리거가 제안 반응 동기화), 모두 끝나면 feedback_done + 회수 기한, 회수 신청(운송장)/보유 선택, 청구 예정(물류비 + 미회수 상품가), "발주서에 담기"는 비활성 + 조건 안내.
- **C-05** `/cn/tasks`: 출고 대기(입금 확인 전엔 버튼 대신 안내), 운송장 → cn_shipped, 브랜드 피드백·거절 사유(zh). 본인 상품 요청서만 출고 가능(서버).
- **A-05** `/admin/samples`·`[id]`: 섹션(입금 확인 대기 / 중국 출고 / 도착·검품 / 브랜드 발송·피드백·회수 / **회수 기한 경과**), 입금 확인(확인 단계 + 감사 로그 `payment.confirm` + CN 알림), 도착, variant별 검품(OK/불량 템플릿/불가 + 사진 1장 + 내부 메모 + **실측 보완 → product_sizes.source=measured**), 모두 끝나면 inspected, 발송(운송장 + 브랜드 알림), 회수 접수(보관 위치), **미회수 확정 수동**(보유 + 청구 + 브랜드 알림 + 감사 로그), 닫기(모두 반납·청구 시).
- 공통 컴포넌트 **8/8**: variant 매트릭스, 입금 안내 카드. 설정 `bank_account`(시드는 자리표시).
- 검증: vitest 116 · SQL 18/18 · tsc · eslint · build(샘플 화면 119~136KB) · E2E 스펙에 샘플 경로.

## 안 한 일
- 실서버 확인(Supabase 미연결).
- 미회수 상품가의 발주 차감(`deducted_in_order_id`)은 7단계 `orderTotals`에서.
- 피드백 기한·회수 기한 경과 알림 배치(8단계). 지금은 A-05 화면에서 자동 표시만.
- 샘플 라이브러리 별도 화면(재제안 가능 표시) — 위치 기록까지만.
- 검품 결과의 `info_match_rate`(KPI)는 7단계 본품 검품과 함께 inspections 테이블로.

## 질문
1. **매트릭스 기본값**: "기본 1"을 제안마다 **첫 variant 1장**으로 해석했다(컬러×사이즈 전부 1이면 10장이 기본이 되어서). 맞나?
2. **보유 선택**: 브랜드가 "갖고 있을게요"를 누르면 `kept`(청구 대기), 관리자가 미회수 확정을 눌러야 청구. 브랜드 선택만으로 즉시 청구해도 되나? (돈은 수동 원칙이라 지금은 관리자 확정)
3. **실적 등급 후불**: proven 브랜드 샘플비는 언제 청구 대상이 되나? 지금은 금액만 고정·표시하고 입금 흐름 없음(청구서는 플랫폼 밖).

## 독립 리뷰 반영 (01d1a13 · d8197b4 · 47f4c65)
1. 브랜드가 `sample_requests` 테이블을 직접 읽으면 CN 운송장이 보였다 → 컬럼 grant(0026) + SQL 18l.
2. 여러 원청 상품이 섞인 요청서를 한 CN이 통째로 출고 → **항목 단위 출고**(0025 `sample_items.cn_tracking/cn_shipped_at`), 모두 출고되면 요청서 cn_shipped. C-05는 내 미출고 항목이 있는 요청서만.
3. 브랜드가 피드백을 안 하면 delivered에 영원히 머물고 회수 기한이 시작되지 않음 → 피드백 기한 경과 시 A-05 [피드백 마감 → 회수 기한 시작].
4. 출고 불가(unavailable) 항목에 피드백·보유·청구가 열려 있었다 → 판정·화면·액션에서 제외.
5. 미회수 확정·회수 접수에 상태 가드 없음 → 받은 뒤(delivered/feedback_done)만, 미회수는 브랜드 보유 선택 또는 회수 기한 경과(반납 운송 중이면 불가)만.
6. 보유 선택(청구로 이어짐)에 구매 권한 요구.
7. 관리자 돈 행위 감사 로그가 대행(on_behalf)으로 기록 → brand_id는 diff로.
8. A-05 큐가 전체 sample_items를 읽어 1000행 상한에서 잘릴 수 있음 → 열린 요청서 항목만.
- 같은 문제(여러 원청 혼재 출고)는 7단계 발주에도 있어 **발주 라인 단위 출고**로 설계한다.
