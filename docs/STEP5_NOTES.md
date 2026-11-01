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

---

## 마감 (2026-11-01) — 한 일
커밋: d4ce35e(0014) · 41597b7(0015, 뷰·권한) · b7…(번역 검증) · 9506f76(A-03) · b541277(A-04) · 5c7c11e(B-04·B-05)

- **0014** `offers.option_prices`(옵션 KRW 고정)·`sample_logistics_krw`(1벌 기준 물류비, 중량 비노출)·`status_before_recheck`, `products.translation_meta`, 재확인 캐스케이드가 직전 상태 기록. **0015** 제안·상품 브랜드 뷰 `is_admin() or`(대행), 새 금액 컬럼 grant. SQL 검증 15.
- **번역 검증** `lib/translate/check.ts`: 역번역 bigram 유사도 + 용어 사전 위반 → 필드별 "불확실". `translateWithCheck()`(번역·역번역 2회). 원가 필드는 여전히 타입상 불가.
- **A-03** `/admin/products`(검수 대기·재확인 큐, 기한 순) · `/admin/products/[id]`: 사진·사실 정보(원가·원청·신뢰 점수 — 관리자 전용), 원문|번역 병기 + 하이라이트(유사도 %, 역번역, 사전 위반), [번역 초안](빈 칸만 채움), 용어 사전 추가(승인), 품질 메모 노출 토글, 공개 조건, **원클릭 승인**(조건 + 한국어 상품명), **템플릿 반려**(settings.rejection_templates + 메모 → CN 알림), 비공개. **재확인 재승인**: 걸린 제안을 현재 원가·환율·브랜드 요율로 재계산 → 같으면 `status_before_recheck` 복원, 다르면 `reconsent_pending` + 가격 갱신 + 감사 로그 `price.reprice` → 상품은 살아 있는 제안이 있으면 offering, 없으면 reviewed.
- **A-04** `/admin/offers` · `/admin/offers/[id]`: 브랜드 선택(기본 = 상품이 들어온 요청의 브랜드) → 요청 항목(없으면 추천) → 브랜드 요율 미리보기(**서버 발행과 같은 순수 함수 `computeOfferFixed`**), 희망 단가 대비 %, 범위(`target_diff_pct` 15%) 초과 시 코멘트 필수, 유형·독점·유효기간 자동 → [발행]. 서버: 상태·공개 조건·한국어명 재검사, 다른 브랜드 항목 연결 금지, 독점 충돌·중복 차단(D15), offers 1행 고정, 감사 로그(on_behalf), 브랜드 알림(digest). 제안 이력 표.
- **B-04** `/b/{slug}/offers`: 요청 → 항목별 라인시트 묶음 → 위아더 추천 → 만료 접기. 카드: 3:4 실물컷·코드·컬러칩·사이즈·혼용률·공급가(+상품가·수수료)·실물 확인·추천·독점 D-day, 관심/보류/거절(사유 탭 + 한 줄). 거절 메모는 용어 사전 적용 zh 번역 → CN 코멘트. 반응 후 항목 집계(관심 → selected, 모두 거절 → sourcing + CN 알림). **PDF** `/offers/print`(A4 가로 인쇄, 외부 라이브러리 없음).
- **B-05** `/b/{slug}/offers/[id]`: 갤러리(실물컷 먼저), 컬러칩, 사이즈표(실측/원청 표시), 혼용률·세탁·원산지(코드→라벨), 단가표 + 수수료 내역(포함 범위 문구), 공급 형태·리드타임·MOQ·최소 수량, 홀딩, 샘플비 한 금액(+미회수 시 상품가 안내), 옵션 KRW, 허용 오차·물류 별도 고지, 모바일 하단 고정 반응 버튼. "샘플 요청서에 담기"는 6단계(비활성).
- 공통 컴포넌트 6/8: + 라인시트 카드, 금액 내역표.
- 테스트: vitest 99(+발행 미리보기·옵션·유형·독점·재승인·고정값·번역 검증), SQL 15/15, E2E 스펙에 B-04·B-05·print 경로.

## 안 한 일
- 실서버 확인(Supabase 미연결) — 특히 번역 2회 호출·트리거 연동·서명 URL.
- 알림 다이제스트 묶음 발송(제안 7개 → 1통)은 notifications 행만 digest로 쌓고 발송은 8단계.
- 제안 만료 배치(유효기간·독점 종료 → expired, 무반응 14일 표시)·환율 ±3% 재확인 배치 — 크론/스케줄은 8단계 알림과 함께.
- 재동의(reconsent_pending) 화면: 지금은 카드의 관심 버튼(구매 권한자만)으로 재동의. 이전 가격 대비 표시는 다음 라운드.

## 질문 (기획 확인 필요)
1. **상품 단위 녹인 마진 override**: PRD 7장은 `hidden_margin_rate = product ?? brand ?? settings`인데 products에 컬럼이 없다. 추가할까? (지금은 brand ?? settings)
2. **재승인 가격 기준**: 재확인 재승인 시 현재 설정 환율·브랜드 요율로 다시 계산한다. 발행 시점 환율을 유지하고 원가만 반영해야 하나?
3. **희망 단가 범위**: ±15%(`target_diff_pct`)로 정했다. 값 확인.
4. **샘플비 표시**: B-05는 물류비(1벌 기준)를 "한 금액"으로, 미회수 시 상품가를 보조 문구로 보여준다. 기획서 §6 "샘플비 = 상품가 + 특송 + 국내 배송, 한 금액"과 D13 "물류비 항상·상품가는 미회수 시"가 섞여 있어 후자를 따랐다. 맞나?
5. **추천 제안 독점**: 추천은 비독점. 같은 상품을 여러 브랜드에 동시에 추천 가능하게 두었다(요청 브랜드 독점 기간 중엔 차단). 맞나?
