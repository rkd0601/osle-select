# 5단계 노트 — 검수·발행 (번역 파이프라인 · A-03 · A-04 · B-04 · B-05)

Claude Code(개발) → Cowork(기획·검증). 기준: 기획서 §5(제안)·§6·§7·§9(A-03·A-04·B-04·B-05)·§10 F4·§11 번역, PRD D8·D15·D16·4·7장, CLAUDE.md 절대 규칙 1·3·5·6·11.

## 계획 (착수 2026-11-01)

### 데이터
- `0014_offers_stage5.sql` (스키마)
  - `offers.option_prices jsonb` — 라벨·행택·수정 옵션을 발행 시점 KRW로 고정(원가×환율×(1+녹인 마진), 수수료 미적용, PRD 7장). 브랜드 뷰의 `strip_cost_keys` 옵션 대신 이걸 쓴다.
  - `offers.sample_logistics_krw int` — 샘플 물류비 1벌 기준(중량은 비노출, 금액만). `sample_fee_product_krw`(미회수 시 상품가)와 함께 B-05에 "한 금액"으로.
  - `offers.status_before_recheck offer_status` — 재확인(D16) 후 재승인 시 가격이 같으면 **이전 반응 복원**(PRD 4장). `cascade_product_recheck` 트리거가 기록.
  - `products.translation_meta jsonb` — 역번역 비교 결과(필드별 유사도·불확실 표시·사전 외 용어). A-03 하이라이트 원천.
  - settings: `target_diff_pct`(0.15, 희망 단가 대비 ± 초과 시 브랜드 코멘트 필수 — F4).
- `0015_brand_offer_views.sql` (뷰·권한, 별도 커밋): `v_offers_brand`·`v_products_brand`·하위 뷰에 `is_admin() or`(대행, 0013과 동일), `v_offers_brand`에 `option_prices`·`sample_logistics_krw`, `v_products_brand`의 옵션 컬럼 제거(원가 키 원천 차단).

### 순수 로직 (테스트 필수)
- `lib/pricing.ts`: `offerPreview(costTiers, ctx)` → 상품가·공급가 tier, `targetDiffPct(target_supply, supply)`, `optionPricesKrw(labels, mods, ctx)`, `sampleLogisticsPerUnit(weight_g, ...)`. 마진·수수료 해석 `resolveRates(brand, settings)`(PRD 7: hidden_margin = brand ?? settings, fee = brand ?? settings — 상품 단위 녹인 마진 override 컬럼은 PRD에 있으나 스키마에 없음 → 질문).
- `lib/offers.ts`: 발행 가능 판정(상품 상태·공개 조건·독점 충돌: 다른 브랜드의 독점 기간 중 제안이 살아 있으면 재제안 불가, D15), 제안 유형 결정(request / reoffer / recommend), 재승인 후 offer 상태(`price 같음 → status_before_recheck`, `다름 → reconsent_pending`).
- `lib/translate`: `translateWithCheck()` — zh→ko 번역 → ko→zh 역번역 → 문자 bigram 유사도로 필드별 불확실 플래그, 용어 사전 주입은 기존. 원가 필드 타입 차단 유지.

### 화면·액션
- **A-03** `/admin/products`(검수 대기·재확인 큐, 기한 순) · `/admin/products/[id]`: 좌 원문(zh) / 우 번역(ko, 편집) + 불확실 하이라이트, [번역 초안], 용어 사전 추가(승인제), 공개 조건 자동 판정, 품질 메모 노출 토글, **[템플릿 반려]**(settings.rejection_templates 체크 + 메모 → `rejected_reasons`, CN 알림) / **[승인 → 검수완료]**(조건 + 한국어 상품명 필수, 원클릭). 재확인 건: 변경 필드(`recheck_reason`) 하이라이트, 승인 시 걸린 제안 재계산 → 가격 같으면 복원, 다르면 `reconsent_pending`.
- **A-04** `/admin/offers`: 검수완료·제안중·재제안 풀 상품 → 브랜드 + 요청 항목(기본: `source_request_item_id`) 선택 → 그 브랜드의 마진·수수료로 상품가·공급가 미리보기, 희망 단가 대비 ±%, 독점 종료일·유효기간 자동 → [발행]. 첫 제안·재제안·추천이 같은 화면·같은 액션. 범위 초과 시 코멘트 필수. 발행 = offers 1행(가격·환율·마진·옵션 KRW·샘플비 고정), 감사 로그, 브랜드 알림(digest).
- **B-04** `/b/{slug}/offers`: 요청 → 항목별 라인시트(큰 3:4 실물컷, 코드, 컬러칩, 사이즈, 공급가 + 내역(상품가·수수료 20%), 혼용률, 실물 확인 배지, 추천 표시, 독점 D-day). 카드에서 관심/보류/거절(사유 탭 + 한 줄 → 용어 사전 적용 zh 번역 → CN). 반응 후 `itemStatusAfterReactions`로 항목 집계(모두 거절 → sourcing + CN 알림). **라인시트 PDF**: 인쇄용 라우트(`/offers/print`) + 브라우저 인쇄(외부 의존 없음).
- **B-05** `/b/{slug}/offers/[id]`: 갤러리(실물컷 먼저), 컬러칩, 사이즈표(출처), 혼용률·세탁·원산지(코드 → 라벨), 수량별 단가표 + 수수료 내역, 공급 형태·리드타임, 홀딩 조건, 샘플비 한 금액, 라벨·수정 옵션(KRW), 허용 오차·물류 별도 고지. "샘플 요청서에 담기"는 6단계(비활성).
- 공통 컴포넌트: **라인시트 카드**, **금액 내역표**(4/8 → 6/8).

### 검증
- 단위: 미리보기 가격(시드 17,570/21,090 재현), 옵션 KRW, 독점 충돌, 재승인 후 상태, 역번역 유사도.
- SQL: 0014/0015 후 브랜드 뷰에 원가 키 없음(옵션 jsonb 포함), 대행 노출, recheck 이전 상태 기록.
- E2E 뼈대: B-04 응답에 금지 키 없음(기존 스펙 경로 추가).
