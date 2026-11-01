# 기획 결정 로그 (Cowork → Claude Code)

개발이 `docs/STEP*_NOTES.md`에 올린 질문에 대한 **확정 답**. 여기 적힌 것은 PRD와 같은 효력이며, 충돌하면 PRD를 이 문서대로 고친다.
답은 Jay가 기획 라운드에서 확정한 원칙(매칭 서비스 / 소량 강조 금지 / 브랜드엔 결과만 / 원가·마진 비노출 / 결제 수동)에서 끌어냈다.

## 2026-11-01 — STEP4 질문 7건

| # | 질문 | 결정 | 근거·구현 메모 |
|---|---|---|---|
| 1 | B-02 "+ 항목 추가" 버튼을 없앨까 | **남긴다.** 기본 1개, 최대 20. | Jay 기획 라운드 확정: "여러 스타일을 한 번에 요청". F1의 "분할은 브랜드가 하지 않는다"는 *한 항목을 쪼개는 일*을 관리자가 한다는 뜻. 브랜드가 애초에 여러 개를 올리는 건 허용. PRD 5장 B-02 문구 보정. |
| 2 | 예상 수량 "구간 선택" 값 | **select 고정값**: `lt30`(30 미만) · `30_100` · `100_300` · `300_1000` · `gt1000` · `tbd`(미정). 저장은 코드(`expected_qty_range`), 표시는 i18n `qtyRange.<code>`. | "소량" 강조 금지 → 라벨에 "소량/대량" 단어 쓰지 않고 숫자만. 관리자는 자유 수정 가능(대행). settings 아님(코드 enum). 기존 자유 입력 데이터는 `tbd`로 마이그레이션. |
| 3 | 희망 납기 경고 `min_lead_days` | **settings 키 추가, 기본 14일, 경고만(저장 차단 아님).** | 샘플(약 7일) → 발주 확인(약 7일)이 최소. 경고 문구 키 `request.warn.targetDateTooSoon`. 관리자 대행 입력에도 같은 경고. |
| 4 | 실물 확인 자동 체크(EXIF/GPS) | **MVP는 자기 신고 + `verified_by/at` 기록 + A-03에서 관리자 확인(체크박스 "실물 확인 사진 맞음").** EXIF 검사는 하지 않는다. | 브라우저가 증명 못 하는 걸 흉내 내지 않는다. 대신 A-03 검수 체크리스트에 "실물컷 ≥1이 own 소스인지" 자동 표시(이미 `source=own`로 기록됨). 품질 약속은 **검수와 검품**이 지키는 것이지 EXIF가 아니다. |
| 5 | CN_VENDOR(원청 본인)의 원청 생성 | **막는다.** CN_VENDOR는 `vendors.owner_profile_id = auth.uid()`인 원청 1곳에 고정, C-02에서 원청 선택 UI 숨김. 신규 원청 생성·원청 변경은 CN_SOURCER/ADMIN만. | 0014에 `vendors.owner_profile_id uuid null` + 인덱스. `createQuickProduct`/`updateProduct`에서 role=CN_VENDOR이면 vendorId를 자기 원청으로 강제(입력 무시). CN_VENDOR 계정 생성 시 ADMIN이 원청을 지정(A-08). |
| 6 | 라벨·수정 옵션 단가 변경도 재확인? | **아니오.** 재확인 트리거는 현행(원가 구간·공급 형태·리드타임·생산 MOQ·최소 수량·홀딩·원청) 유지. 원청 기본값 중 **홀딩** 변경만 상속 상품 재확인(`recheck_reason='vendor_hold'`, 이번에 `saveVendor`에 구현). | 옵션 단가는 5단계에서 발행 시 `offers.option_prices`(KRW)로 고정되므로 이미 발행된 제안엔 영향 없음. 0015에서 `v_products_brand`의 `label_options/mod_options` 컬럼을 **제거**하고 B-05는 `v_offers_brand.option_prices`만 본다(원가 키 원천 차단). |
| 7 | 협업 방식(덮어쓰기 사고) | **Cowork 규칙**: ① 작업 전 로컬 폴더를 통째로 다시 가져와 그 위에서만 고친다 ② 파일을 쓸 때 mtime 가드(개발이 그 사이 바꿨으면 쓰지 않고 `_cowork/<경로>`에 둔다) ③ 마이그레이션 번호는 개발이 발급한다(Cowork는 SQL 제안을 `docs/`에 적고 번호는 안 붙임) ④ Cowork가 고친 파일 목록은 매번 `docs/REVIEW_<날짜>.md`에 남긴다. 개발 규칙: 매 단계 마감 때 `docs/STEP<n>_NOTES.md`에 "한 일/안 한 일/질문". | 이번 라운드부터 적용. git 브랜치는 개발 소유(`feat/*`), Cowork는 브랜치를 만들지 않는다. |

## STEP5 계획 검토 (착수 전 보정)

계획(`docs/STEP5_NOTES.md`)은 PRD D8·D15·D16·7장과 맞다. 아래만 보정해서 들어간다.

1. **상품 단위 녹인 마진 override**: PRD 7장에 "상품 단위 override 가능"이 있으나 스키마에 없음 → **MVP는 브랜드 단위까지만**(`brands.hidden_margin_rate ?? settings`). PRD 7장에서 상품 단위 문구 삭제. 필요해지면 `offers`에 발행 시 수동 가격 조정(`admin_price_adjust_krw` + 감사 로그 `price.manual_adjust`)으로 푼다 — 이게 "제안 = offer 1행" 원칙에 더 맞다.
2. **`status_before_recheck`**: `lib/offers.ts#statusAfterReapproval`이 이미 이 컬럼을 읽는다 → 0014에 컬럼 추가 + `cascade_product_recheck` 트리거에서 `status_before_recheck = status` 기록(recheck가 아닐 때만). 단위 테스트는 있음(offers.test.ts).
3. **재승인 후 가격 비교 기준**: "가격 같음"은 `price_tiers` jsonb 전체 동일 + `fee_rate` 동일. 환율만 바뀌어 상품가가 바뀌면 "다름" → `reconsent_pending`(브랜드에 "가격이 바뀌었습니다" 카드, 재동의 버튼). 재동의는 반응 복원이 아니라 **새 반응**이다.
4. **독점 충돌(D15)**: 같은 상품에 다른 브랜드의 살아 있는 제안(`new/interested/hold/reconsent_pending`)이 `exclusive_until` 안이면 발행 거부(`offer.error.exclusive`). `hold`도 포함(보류 중 독점 유지). `declined/expired`는 즉시 해제.
5. **A-04 희망 단가 비교 기준**: 브랜드 `target_price_krw`는 **공급가(수수료 포함)** 기준으로 비교한다(브랜드가 결국 내는 돈). `target_diff_pct` 0.15 초과 시 `admin_comment` 필수.
6. **B-04 거절 사유 번역**: 거절 한 줄 메모는 `translate()`로 zh 번역해 `decline_note_zh`에 저장 → CN에 전달. **CN은 brand 이름을 모른 채**(CN_VENDOR 마스킹 유지) 사유만 본다.
7. **라인시트 PDF**: 브라우저 인쇄(`/b/{slug}/offers/print?ids=`)로 충분. 서버 PDF 생성(puppeteer 등) 넣지 않는다. 인쇄 CSS에 코드·공급가·수수료 내역·실물 확인 배지가 들어가고 **원가·환율·원청은 절대 없음**(E2E 금지 키 검사 경로에 추가).
8. **0015 뷰 권한은 별도 커밋**, 0014 스키마와 분리. 체크 SQL: 브랜드 세션 `v_offers_brand`에 `option_prices` 있고 `v_products_brand`에 `label_options` 없음; recheck 시 `status_before_recheck` 기록; 재승인 후 복원/`reconsent_pending` 분기.

## 다음 단계 예고 (6단계, 기획은 PRD 5장 B-06·B-07·A-05)
샘플 요청서(variant 매트릭스 **숫자 입력**, 기본 1, settings.sample_qty_max), 샘플 물류비 한 금액 + 미회수 시 상품가 안내, 입금 안내 카드(수동), 회수 체크(A-05), 피드백(관심/보류/거절) → `sync_offer_reaction_from_sample`. 결제 코드 없음(절대 규칙 13).

## 2026-11-01 r4 — STEP6 마감 질문 3건 + 리뷰에서 나온 결정

| # | 질문 | 결정 |
|---|---|---|
| 1 | 매트릭스 "기본 1" 해석 | **제안당 첫 variant 1장이 맞다.** 컬러×사이즈 전부 1이면 과다. 단, 브랜드가 컬러를 고르면 그 컬러의 대표 사이즈(M 또는 가운데) 1장이 자동으로 1이 되게 — UI 편의, 서버 규칙 아님. |
| 2 | 보유 선택 → 즉시 청구? | **관리자 확정 유지.** 돈은 수동 원칙. 브랜드 `kept`는 "청구 예정"으로 표시되고, 관리자 확정 때 청구·감사 로그. **보유 선택은 구매 권한(can_purchase) 필요**(이번에 반영). |
| 3 | 실적(proven) 브랜드 샘플비 청구 시점 | **발주 확정 때 함께 청구**(발주서 `invoice_snapshot`에 "샘플 물류비" 행으로 합산). 발주 없이 끝나면 월말 관리자가 A-05 "청구 대기" 목록에서 수동 청구 표시(`logistics_charge_status`) — 7단계에서 `orderTotals`에 `sample_logistics_krw` 항목 추가, 8단계 A-05에 월말 목록. 플랫폼 밖 청구서(절대 규칙 13). |
| 4 | (리뷰 1) 여러 CN 상품이 한 요청서에 | **항목 단위 출고 채택**(개발이 0025로 먼저 구현: `sample_items.cn_tracking/cn_shipped_at`, 모든 항목 출고 시 요청서 `cn_shipped`). 7단계 발주도 **라인 단위 출고**로 동일 설계. Cowork의 "한 요청서 = 한 출고처" 안은 철회. |
| 5 | (리뷰 6) 미도착(unavailable) 항목 | 피드백·회수·닫기 판정에서 제외(반영). 물류비는 **요청 시점 고정값 유지**, 미도착분은 관리자가 A-05에서 `credit` 처리(브랜드 크레딧, 7단계 `credit_krw`에 합산) — 자동 재계산 없음. |
| 6 | (리뷰 7) 샘플 피드백 → 제안 상태 트리거 | 트리거 유지하되 **감사 로그 1행 추가**(actor = reacted_by) — 개발이 0025에 트리거 수정. 제안이 이미 만료(`expired`)면 반응만 기록되고 상태는 그대로 → B-07에 "제안 유효기간이 지나 발주로 이어가려면 재제안이 필요합니다" 문구 + 관리자에게 알림(`offer.expired_with_feedback`). |
| 7 | (리뷰 11) 입금 확인 뒤 브랜드 취소 | **입금 확인(`payment_confirmed_at`) 뒤에는 브랜드 취소 불가, 관리자만.** 전이표 `requested → cancelled`의 BRAND_PURCHASE는 `payment_confirmed_at is null`일 때만(서버 액션에서 검사). 환불은 플랫폼 밖, 감사 로그 diff에 `payment_confirmed_at` 포함. |
| 8 | (리뷰 13) 샘플 물류비로 중량 역산 가능 | **허용.** D13 "한 금액"이 요구사항이고, 중량은 `weight_g` 컬럼 비노출(규칙 1)의 취지 = 원가 역산 방지인데 물류비에서 나오는 건 중량뿐 원가는 아니다. CLAUDE.md 규칙 1 주석에 "물류비 금액에서 중량이 추정되는 것은 허용"을 덧붙인다(개발). |
| 9 | (리뷰 15) sample_item 상태(status/return/charge) 전이표 | 7단계 `order_lines`와 함께 `lib/transitions.ts`에 `sample_item_return`(due→returned/kept, kept→charged/deducted)·`sample_item_status`(pending→ok/defect/unavailable) 추가 + 전수 테스트. 지금 액션의 직접 update는 그 뒤 `applyTransition`으로. |
| 10 | (리뷰 14) `issue_offer_locked`의 `current_date` | `(now() at time zone 'Asia/Seoul')::date`로 — 개발 0025. |
