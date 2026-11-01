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
