# 7단계 노트 — 발주 (B-08 · A-06 · B-09 · C-05 재고 응답)

Claude Code(개발) → Cowork(기획·검증). 기준: 기획서 §4 발주 규칙·§5 발주서·§7 선금·물류·§10 F5(B-08 2단계)·§11 핸드오프(예약·선금·견적·수량 확정·미송·도착), PRD D9·D14·4·7·12장, CLAUDE.md 절대 규칙 3·5·7·12·13.

## 계획 (착수 2026-11-01 — Cowork 4라운드와 병렬)

### 체인 (전이 테이블 `order`, 건너뛰기 불가 — 절대 규칙 7)
예약(reserved, 브랜드) → 재고 확인중(stock_checking, 관리자가 CN에 넘김) → CN 라인별 확보/부족 응답 → 확보(stock_confirmed)/부분(partial_confirmed)/부족(stock_short) → [선금 홀딩이면 deposit_pending → 입금 확인 → hold_confirmed] → 범위 견적(quoting → quoted, 관리자) → 수량 확정(qty_confirmed, 브랜드: 확보 수량 이내·라벨·경로) → 최종 견적(final_quoted, 관리자) → **발주 확정**(confirmed, 관리자: 청구 내역 `invoice_snapshot` 고정 + 감사 로그) → 중국 출고 → 위아더 검품(직송이면 건너뜀) → 발송 → 도착 → 검수 보고(report_done, 7일) → 불량 크레딧(다음 발주 차감).
- 선금은 **재고 확인 뒤에만** 안내(stock_confirmed/partial_confirmed → deposit_pending). 재고도 모르는데 선금을 받지 않는다(D9).
- 수량 수정 요청은 확정 후 1회(qty_change_count), 관리자 승인 — 이번엔 카운트·차단만.

### 데이터
- 0023(스키마): `orders.deposit_pct`(예약 시 상품 홀딩 조건 고정), `orders.deposit_note`, `orders.quoted_at/qty_confirmed_at/final_quoted_at`, `orders.report_submitted_at`; `order_lines.cn_note`(재고 응답 메모 zh), `order_lines.defect_qty`(도착 검수 보고), `inspections` 본품 결과는 기존 테이블(type=bulk, results=상품 정보 필드 1:1).
- 0024(뷰·권한): `v_orders_brand`·`v_order_lines_brand`(관리자 메모 제외), `v_order_lines_cn`(본인 상품 라인만, CN_VENDOR 마스킹, **KRW 단가 없음** — 원가와 합치면 마진 역산), order_lines 테이블 컬럼 grant.

### 순수 로직 `lib/orders.ts` (테스트 필수)
- 발주서 담기 판정 = `canAddToOrder`(제안 관심 AND 그 제안의 샘플 피드백 관심; 리오더·관리자 면제 예외) — 서버가 예약 생성 시 강제.
- 예약 검증: 공구 오픈 < 마감, 배송 약속일 − 마감 ≥ 리드타임 + 물류일(미달 경고, 생산 전환이면 차단), 예상 수량 ≥ 최소 수량, 홀딩 없이면 고지 동의 필수, 디테일 수정은 MOQ 충족 시만.
- 재고 응답 집계: 라인 전부 confirmed → stock_confirmed, 일부 short → partial_confirmed, 전부 short → stock_short.
- 수량 확정 검증: 라인 qty ≤ confirmed_qty(부분 확보 시), 합 ≥ 최소 수량.
- 금액: `orderTotals`(tier = 발주 총수량, 수수료, 옵션, **미회수 샘플 차감 1회**, 선금 차감, 크레딧, 최종 물류) → `invoice_snapshot`. 선금 `depositKrw`(예상 수량 기준) → 확정 수량으로 정산. 범위 견적 초안 `logisticsEstimateKrw`.
- 검품 일치율 `infoMatchRate(results)`(KPI).

### 화면
- **B-08** `/b/{slug}/orders/new`(1단계 예약: 담을 수 있는 제안 = 관심 + 샘플 관심, 일정·예상 수량 매트릭스·홀딩 선택·수정 요청) · `/b/{slug}/orders/[id]`(2단계 수량 확정: 확보 수량 이내 매트릭스·라벨·경로·금액 실시간, 선금 입금 안내 카드, 최종 견적 확인).
- **A-06** `/admin/orders`·`[id]`: 체인 단계별 행위(재고 확인 요청 → 결과·부족 처리 → 선금 안내·입금 확인 → 범위 견적(자동 초안) → 최종 견적 → **발주 확정**(청구 내역) → 출고·검품(기준서 = 상품 필드 1:1 → 리포트) → 발송·도착 → 검수 보고 처리(크레딧/재발송)), **미송 관리**(라인별 수량·예상 입고일·대응 기록).
- **B-09** `/b/{slug}/orders`: 진행·미송 현황·검품 리포트·도착 검수 보고(라인별 불량 수량, 7일).
- **C-05** 재고 확인 요청: 라인별 확보/부족 + 확보 수량 + 메모 → 집계 전이. 출고(confirmed → cn_shipped).

### 질문 (착수 전 — 보수적 기본값으로 진행)
1. 공구 일정 필수 여부: 오픈·마감·배송 약속일 3개 모두 필수로 둔다(F5). 맞나?
2. 물류일(배송 약속일 검증) 기본값: settings `logistics_days`(10일)를 추가해 쓴다.
3. 범위 견적의 "추정 ±N%": settings `quote_margin_pct`(0.15) 추가.
4. 불량 크레딧 금액 = 불량 수량 × 확정 단가(상품가 + 수수료)? 관리자가 금액을 수정 가능하게(감사 로그) 둔다.

---

## 마감 (2026-11-01) — 한 일
커밋: 4a0efa4(0023) · aa1a262(0024, 뷰·권한) · 1228dd9(로직) · 8ef443c(0027) · ed13862(0028) · c92b3a6(Cowork r4 수용) · 22615a7(0029) · 6db22ee(0030, 뷰) · 070158f(헬퍼) · c9cd39a(액션·화면) · 6a23189(0031) · 62e81cc(0032, 뷰) · 60f200e(r4 이관)

- **Cowork r4 수용**: 게이트 후 지시 문구대로 1커밋. B-07 "발주서에 담기"는 조건 충족 시 B-08 링크로 활성화.
- **체인** (전이표 `order` + 서버 가드, 절대 규칙 7): 예약 → 재고 확인 요청(관리자) → CN 라인별 확보/부족 응답(`respondStock`, 본인 상품 라인만, 집계 전이) → 부족이면 재확인/취소 → 선금 홀딩이면 선금 안내(`orderDeposit`, 확보 수량 기준) → 입금 신고(브랜드) → 입금 확인(관리자, 감사 로그 `payment.confirm`) → 견적 시작(**선금 홀딩 발주서는 hold_confirmed 뒤에만** — 전이표가 stock_confirmed → quoting을 허용하므로 서버 가드 추가) → 범위 견적(자동 초안 `logisticsEstimateKrw` × `quote_margin_pct`, 관리자 조정) → 수량 확정(브랜드, canPurchase, 확보 수량 이내·최소 수량·라벨 MOQ·경로) → 최종 견적(물류 실비) → **발주 확정**(`invoice_snapshot` 고정, 라인 공급가 고정, 미회수 샘플 1회 차감 + `deducted_in_order_id`, 크레딧 잔액 사용(합계 이내), 실적 브랜드 샘플 물류비 합산, 감사 로그 `order.confirm`, CN 출고 알림) → CN 라인 단위 출고(확정 뒤에만, 모든 라인 출고 시 cn_shipped) → 검품 경유면 위아더 도착·본품 검품(기준서 = 상품 정보 필드 1:1 `bulkCriteria` → `inspections` bulk + `info_match_rate`), 직송이면 바로 → 발송(운송장 0029 `kr_tracking`) → 받았어요(검수 보고 기한 `report_days`) → 도착 검수 보고(라인별 불량) → 관리자 크레딧 확정(불량 × 공급가 제안, 조정 가능, 감사 로그 `order.credit`) → 다음 발주에서 차감.
- **금액** `lib/orders.ts`: `orderInvoice`(제안별 총수량으로 tier, 수수료 = 소계 × 제안 고정 fee_rate, 옵션, 샘플 물류비, 미회수 차감, 선금, 크레딧, 최종 물류), `orderOptionLines`(라벨 = 선택 수량 × 단가, 디테일 수정 = 제안 총수량 × 개당 — 발행 고정 `option_prices` KRW만), `orderDeposit`, `creditAmount`, `infoMatchRate`, `bulkCriteria`. 화면 금액은 서버 액션 미리보기(`previewReserve`·`previewOrder`)가 같은 함수로 계산 — 클라이언트에 가격 로직 없음(규칙 5).
- **수량 확정 뒤 청구 수량**: 라인 qty(0 포함)만 — 0을 확보 수량으로 되돌리던 fallback 제거(빼둔 라인이 청구되는 버그).
- **미송**: 관리자가 라인별 수량·예상 입고일·대응 메모(브랜드에 보임, 로그 누적), 해결. 브랜드는 "N일 뒤 · 대체/기다림/취소"만 선택(`backorder_log`에 기록, 관리자 알림). 원청 대응은 위아더.
- **화면**: B-08 `/b/{slug}/orders/new`(담기 조건 미충족은 사유와 함께 비활성, 일정 3개, 예상 수량 매트릭스, 홀딩 선택 + 무홀딩 고지 동의, 수정 요청 MOQ, 예상 금액) · `/b/{slug}/orders/[id]`(누구 차례 한 줄, 선금 입금 안내 카드 `kind=deposit`, 범위 견적, 2단계 수량 확정 폼 + 금액 미리보기, 라인 표, 미송 안내·선택, 운송장, 검수 보고 폼, 청구 내역(확정 후 고정), 타임라인) · B-09 `/b/{slug}/orders` · A-06 `/admin/orders`(재고/선금/견적/출고/브랜드 차례/미송/크레딧 섹션)·`[id]`(단계별 다음 행동 1개, 라인·CN 메모, 본품 검품 폼, 금액 미리보기, 감사 로그) · C-05 `/cn/tasks` 발주 재고 확인·발주 출고 섹션(zh, KRW 없음).
- **r4 이관 (DECISIONS r4)**: #3 실적 브랜드 샘플 물류비를 발주 확정 때 1회 합산(`logistics_billed_order_id`) · #4 B-06 출고처 수 안내(숫자만) · #5 미도착 항목 크레딧(A-05, 1회, 감사 로그 → 브랜드 크레딧 잔액) · #6 피드백 트리거 감사 로그(`feedback_by` actor) + 만료 제안 관심 시 관리자 알림·B-07 문구 · #7 입금 확인 뒤 브랜드 취소 불가 · #8 CLAUDE.md 규칙 1 주석 · #9 필드 전이표 5개(`sample_item`·`sample_item_return`·`sample_item_charge`·`order_line_stock`·`order_line_backorder`) + `applyFieldTransition`(낙관적 잠금·감사 로그)으로 직접 update 교체, 전수 테스트 · #10 `issue_offer_locked` KST 날짜 · CN 뷰 ADMIN 언마스킹(0032).
- **SQL 체크 20~22**: 트리거 감사 로그 actor·KST 함수, 브랜드 발주 뷰 금지 키(운송장만 공개, 라인 CN 컬럼 grant 없음), CN 뷰 ADMIN 언마스킹·CN_VENDOR 마스킹.
- 게이트: vitest 137 · tsc · eslint · build · SQL 22/22.

## 안 한 일 (다음 단계로)
- 발주 확정 후 수량 수정 요청 1회(`qty_change_count`, confirmed → qty_confirmed 전이는 있음) — 화면·카운트 미구현. 8단계 전후로.
- 관리자 면제(`admin_waived`)로 담기 조건 예외를 주는 화면 — 컬럼만 있음, A-06에 토글 없음.
- 검품 사진·실측(본품) — 기준서 일치/불일치·통과 수량까지만. 사진은 샘플 검품(A-05)과 같은 업로드로 붙일 예정.
- ~~크레딧 잔액 read-modify-write~~ → 독립 리뷰 1로 0035 원자 함수 반영(아래).
- 발주 확정 전 과정을 한 DB 트랜잭션(함수)으로 묶는 것 — 지금은 '발주서 잠금 → 자원 선점 → 청구 내역 기록' 순서로 이중 차감·이중 사용은 막았지만, 중간 실패 시 청구 내역이 비는 창이 있다(재시도로 복구할 관리자 액션은 다음).
- 리오더 판정은 "같은 상품의 확정 이후 발주"만 — 브랜드 단위 관리자 면제는 위 항목과 함께.
- E2E(Playwright) 발주 체인 경로·원가 누출 순회에 `/orders` 추가 — 스켈레톤은 `E2E_BASE_URL` 없으면 skip.

## 질문 (Cowork)
1. 디테일 수정 옵션 가격 `option_prices.mods[].price_krw`를 **개당**으로 보고 제안 총수량을 곱했다. 건당(고정비)이면 qty 1로 바꾼다.
2. 실적 브랜드 샘플 물류비 합산 대상: "이 발주 상품이 들어 있던 요청서"만(요청서 단위 1회). 발주로 이어지지 않은 요청서는 8단계 A-05 월말 "청구 대기" 목록 — 맞나?
3. 크레딧 사용: 발주 확정 때 **잔액 전부를 합계 한도 내 자동 사용**. 브랜드가 아껴 쓰는 선택이 필요하면 확정 전 관리자 입력으로 바꾼다.
4. 미송 브랜드 "취소" 선택 시 금액 조정은 관리자 크레딧으로 처리(자동 차감 없음). 맞나?
5. 선금 금액은 확보 수량(confirmed_qty) × 최저가가 아니라 **확보 수량 기준 tier**로 계산한다(선택 tier가 높아질 수 있음). 기획 의도와 같은가?

## 독립 리뷰 (서브에이전트, 2026-11-01) — 13건, 원가 누출·브랜드 교차·CN KRW 노출 없음. 모두 반영
| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| 1 | HIGH | 크레딧 잔액 read-modify-write → 동시 확정 시 이중 사용·적립 유실 | 0035 `use_brand_credit`(행 잠금, 잔액 한도)·`credit_brand`(+), 서비스 롤 전용. 확정·크레딧 확정·미도착 크레딧 모두 RPC. SQL 24 |
| 2 | HIGH | 수량 0으로 뺀 제안의 미회수 샘플까지 deducted로 표시 | `orderInvoice.deducted_sample_ids` — 실제 차감한 항목만 전이. 회귀 테스트 |
| 3 | MED | 같은 브랜드 두 발주 동시 확정 시 샘플 차감·샘플 물류비 이중 | 확정 순서 재구성: 발주서 잠금(전이) → 샘플·물류비 **조건부 선점**(선점한 것만 청구) → 크레딧 원자 사용 → `invoice_snapshot` |
| 4 | MED | `applyFieldTransition` 부분 갱신 시 감사 로그 없음 | 실제 바뀐 행은 항상 감사, `allowPartial`(선점용) |
| 5 | MED | 선금 확인 뒤(quoted 등) 브랜드 취소 가능 | 선금 확인 뒤 브랜드 취소 거부(관리자만), 버튼 숨김 |
| 6 | MED | 유효기간 지난 제안으로 예약 가능 | 담기 판정에 `valid_until ≥ 오늘(KST)`, 화면에 "재제안 필요" |
| 7 | MED | 구매 권한 없는 멤버가 수량을 먼저 덮어씀 | `canPurchase` 선검사 + 전이 성공 뒤에만 수량·불량 기록 |
| 8 | LOW | CN 동시 응답 시 집계 전이 누락 → 멈춤 | A-06 "응답 다시 집계" `reaggregateStock` |
| 9 | LOW | 라인 단가(개당 올림)와 청구(소계 올림) 차이 → 크레딧 초과 | 라인에 실효 단가 `floor((소계+수수료)/수량)` 고정 |
| 10 | LOW | confirmed → qty_confirmed 되돌림 간선(차감·크레딧 꼬임) | 간선 제거(수량 수정 1회는 되돌림 로직과 함께 다시) |
| 11 | LOW | 견적·선금 안내 금액이 감사 로그에 없음 | `order.deposit_request`·`order.quote_range`·`order.quote_final` |
| 12 | LOW | 검수 보고 기한 미강제 | 기한 경과 시 브랜드 보고 거부(관리자 대행은 가능) |
| 13 | LOW | 검품 통과 수량·미송 수량 무제한, 미송 상태 무관 | 라인 수량 이내, 미송은 확정~도착 사이만 |
