# Claude Code 다음 작업 (2026-11-01 r6 → 8단계 마감)

> 멈추지 말고 위에서부터. **r5 이관 6건이 아직 안 들어갔다 — 이번에 반드시.**

## 0. Cowork r5·r6 수용
- `docs/REVIEW_2026-11-01_r5.md`, `docs/REVIEW_2026-11-01_r6.md` 읽기 → `git status` → 게이트(vitest 152 · tsc · eslint · build · db:check 25/25) → 커밋 2개: (a) `fix(db): 0040 brands 컬럼 grant` (b) `fix(notify,orders): 크론 전부 스케줄, 즉시 알림 선점 발송, digest 재시도, instant 등급, reportDeposit 가드·감사, SLA 배치 정렬, 크레딧 RPC 실패 처리, 환불 예정, CN 확보 미달=short, 리오더 qty>0, 수정 MOQ 재검사`.

## 1. r5 이관 (순서대로, 각각 커밋)
1. **샘플 게이트 (brand_id, product_id)**: `eligibleOffersForBrand`에서 `sample_items`를 brand+product로 조인(`offers!inner(product_id)`), `orderEligible`에 `adminWaived` 전달. `admin_waived`는 `offer.status='interested'`·`valid_until` 유효할 때만 통과. A-06 발주 상세에 면제 토글 + 감사 로그 `order.waive_sample_gate`. 테스트: 재발행 제안도 같은 상품 샘플 피드백으로 통과.
2. **`v_inspections_brand`**(results, defect_qty, info_match_rate, inspected_at, target_id, type; inspected_by·template_id 제외) 0036 + grant + SQL 체크 26(브랜드 금지 키 없음·타 브랜드 0행). B-09 상세 "검품 리포트" 섹션(관리자가 sent_to_brand로 넘긴 뒤부터).
3. **`rebuildInvoice(orderId)`** A-06 버튼: `deducted_in_order_id`·`logistics_billed_order_id`·`order.confirm` 감사 로그의 `credit_used`로 `invoice_snapshot` 재계산, 감사 로그 `order.invoice_rebuild`. `confirmed` 이상 + snapshot null 또는 관리자 강제일 때만.
4. **취소 간선**: `order` 전이표에 ADMIN `hold_confirmed|quoting|qty_confirmed|final_quoted → cancelled`, BRAND_PURCHASE `deposit_pending → cancelled`(`deposit_confirmed_at is null`일 때만 — 서버 가드). 전수 테스트 갱신. A-06·B-09 버튼.
5. **`backorder_log` append RPC** `append_backorder_log(line_id, entry jsonb)` 서비스 롤 전용(0037) — 브랜드 선택·관리자 갱신 둘 다 이걸로.
6. **digest CN 시각**: `deliverDigests`가 zh-CN 수신자는 01:00 UTC 실행에서만 묶도록, `vercel.json` digest `0 0,1 * * *`.

## 2. 8단계 마감
- STEP8 "남은 일": 통합 코멘트 `comment-thread` + `addComment` → notify, A-02 CN 질문 게이트 화면, 타임라인(audit_logs), 핸드오프 카드 템플릿 14건, `notify` 라우팅 전수 테스트, `.env.example` 저장소 포함(`!.env.example`), 3회 실패 ADMIN 알림, `recipients()` 모듈 캐시(60초).
- GETTING_STARTED에 "Vercel 크론 `*/5`는 Pro 플랜" 한 줄.
- `docs/STEP8_NOTES.md` 마감 → `docs/STEP9_NOTES.md`(B-12 쇼핑몰 패키지: cafe24·godo·imweb·smartstore 매핑, 브랜드 뷰 컬럼만, 판매 가능 사진 zip, 원가·원청·중량·_zh 금지, E2E 스캔) 계획 후 착수.
