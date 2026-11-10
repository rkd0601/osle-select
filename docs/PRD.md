# OSLE Select (가칭) — Product Requirements Document v1.0

확정일 2026-11-01 · WE ARE THE / OSLE
원천: 기획서 v1.0 확정본 (웹 보고서). 기획서와 이 문서가 다르면 기획서를 따르고 이 문서를 고친다.
동반 문서: CLAUDE.md (프로젝트 규칙), KICKOFF_PROMPT.md (첫 세션 프롬프트)

---

## 0. 한 줄 정의

브랜드가 원하는 상품을 위아더가 중국 현장에서 **직접 보고 찾아 매칭**하고, **자체 검수로 상품 정보와 실물이 일치하는 품질**을 합리적 단가에 보증하며, 한국에서 검증된 상품과 콘텐츠를 중국 왕홍 유통으로 되파는 B2B 플랫폼. 카탈로그·도매 쇼핑몰이 아니다. 결제·세금계산서는 플랫폼 밖에서 수동(영구).

## 1. 확정 결정 (D1~D18)

| # | 항목 | 결정 |
|---|---|---|
| D1 | 포지션 | 상품↔브랜드 매칭 서비스. 오슬(OSLE) 하위, 초대·신청 기반 클로즈드 B2B. 가칭 OSLE Select / `select.osle.shop` (상수 한 곳에 두고 일괄 교체) |
| D2 | 품질 약속 | ① 직접 보고 고른다 ② 자체 검수 ③ 상품 정보 = 실물 ④ 합리적 단가. 어기면 위아더 책임(크레딧·재발송). 정보 일치율을 KPI로 |
| D3 | 판매 채널 연계 | 발주 확정 상품을 브랜드 쇼핑몰에 "상품 보내기". MVP: 쇼핑몰별 엑셀 + 이미지 zip 표준 패키지(카페24·고도몰·아임웹·스마트스토어). 2차 1순위: 앱/API 연동 |
| D4 | 수익 | 상품가에 녹인 마진 20%(비노출) + 소싱 서비스 수수료 20%(투명 노출) + 샘플 물류비 + 라벨·행택 제작·디테일 수정 비용. PG·수수료형 서비스 사용 안 함 |
| D5 | 소싱 | 요청 1건마다 현장에서 직접 찾는다. 수량은 브랜드 규모에 맞게(대량일수록 단가 유리). 재고 수량은 저장·표시하지 않고 공급 형태(현물/생산)만. 미송은 위아더가 원청과 직접 관리 |
| D6 | MVP 범위 | 요청 → 등록 → 검수 → 제안 발행 → 셀렉 → 샘플 요청서(묶음) → 발주서(묶음: 예약 → 재고 확인 → 선금 → 범위 견적 → 수량 확정 → 최종 견적) → 본품 검품 → 도착 → 검수 보고 |
| D7 | 공급가 | 상품가(KRW) = 원가 × 환율 × 1.20(녹인 마진), 10원 올림. 공급가 = 상품가 × 1.20(수수료, "소싱 서비스 수수료 20%"로 노출). 물류·통관·관부가세는 예약 발주 후 별도 견적. 라벨·수정 비용 별도 항목 |
| D8 | 제안 = 링크 1행 | offer(=product_brand_link): 상품 1 × 브랜드 1 × 요청 항목 1(추천은 null) × 가격. 가격·환율·수수료·독점·유효기간을 발행 시점에 고정. 검수(A-03)와 제안 발행(A-04) 분리. 첫 제안·재제안·추천 모두 같은 발행 액션 |
| D9 | 예약 발주 | 상품(원청 상속) 홀딩 조건(선금 %·기간/불가) 고지. 순서: 재고 확인 → 선금 안내 → 입금 확인 → 홀딩 확정. 홀딩 없이 진행 시 "재고 소진·미송·생산 전환 가능" 고지 동의 |
| D10 | 브랜드 분리 | `/b/{slug}` + 이메일 OTP(6자리·10분·5회) 또는 Kakao OAuth. owner/member, owner가 member에게 구매 권한 위임 가능 |
| D11 | 중국측 입력 | Phase 1 CN_SOURCER(위아더). Phase 2 CN_VENDOR(원청 직접, 브랜드명·희망 단가 비노출). 모바일 간단 등록 → PC 보완. 사진 1장 이상 필수, 5장 이상(실물컷 포함)은 권장(2026-11-09 완화) |
| D12 | 언어·번역 | 구조화 입력(혼용률·사이즈·세탁·컬러는 코드) + 승인제 패션 용어 사전 + LLM 번역 → 역번역 비교 → 불확실 하이라이트 → 관리자 확인. 고정 문구는 zh/ko 템플릿. 원가 필드는 번역 API에 보내지 않음 |
| D13 | 샘플 | 샘플 불가 상품은 제안 불가. 중국 → 위아더 검품 → 브랜드. **회수 원칙**: 샘플 물류비(특송 kg당 15,000원 + 국내 배송, 한 금액)는 항상 청구, 상품가는 회수 기한(14일) 내 반납 시 미청구·미회수(구매) 시 청구. **구매한 샘플값은 발주와 별개로 청구하고 발주 금액에서 차감하지 않는다**(2026-11-09 사이트 수정 9 — 발주 견적서에는 '샘플 구매분은 청구에서 따로' 안내만). 신규 등급 선입금, 실적 등급 후불. 회수 샘플은 샘플 라이브러리 |
| D14 | 본품 | 위아더 검품 경유 기본 + 발주별 직송 옵션. 검품 기준서 = 상품 정보 필드 1:1. 검품 리포트. 도착 검수 보고(7일) → 불량 크레딧(다음 발주 차감)/재발송 |
| D15 | 독점·재제안 | 요청 브랜드 독점 14일. 무반응·거절 시 관리자가 재제안(링크 추가, 상품 복사 없음). 추천 제안은 비독점·표기 |
| D16 | 가격 변동 | CN 원가·공급 형태 수정, 유효기간(30일) 만료, 환율 ±3% → 제안 "재확인 필요"(브랜드에 가려짐) → 재승인 → 가격 변동 시 브랜드 재동의 |
| D17 | 알림·소통 | 모든 상태에 owner_role·due_at. 알림 2등급(즉시/다이제스트). 통합 코멘트(brand/internal/cn, ko·zh). CN→브랜드 질문은 관리자 4시간 게이트 후 자동 노출. 채널: 이메일+인앱 / CN은 WeCom 그룹 봇(담당자명+딥링크) / 알림톡 2차 |
| D18 | 스택 | Next.js(App Router, TS) + Supabase(Postgres/RLS/Auth/Storage) + Tailwind/shadcn + next-intl(ko, zh-CN) + Resend + Claude API. Vercel. 폰트 셀프호스팅: 한글 Pretendard, 숫자·영문 SUIT(unicode-range로 범위 분리), 중국어 Noto Sans SC |
| D19 | 디자인 방향 | 타깃은 트렌드에 민감한 패션 브랜드·인플루언서. 에디토리얼 그리드, 큰 3:4 실물컷, 잉크+페이퍼+시그니처 1색, 숫자는 SUIT로 크게. 단순한 구조의 레이아웃 금지. 세부 비주얼은 다음 라운드(Figma 04 Design Direction 참조) |

## 2. 역할과 권한

| 역할 | 코드 | 범위 | 로케일 |
|---|---|---|---|
| 위아더 관리자 | `ADMIN` | 전체. 브랜드 대행 시 audit_logs(on_behalf_of_brand) | ko |
| 중국 소싱 담당(위아더) | `CN_SOURCER` | 배정된 요청 항목 + 본인 등록 상품. 희망 단가 CNY 환산 열람 가능 | zh-CN |
| 원청 직접 입력자(2차) | `CN_VENDOR` | 본인 상품 편집 + **자기 원청(`owner_profile_id`) 상품 읽기 전용**(소싱 담당이 대신 등록한 것, 품질 메모 제외). 브랜드명·희망 단가 비노출 | zh-CN |
| 브랜드 owner | `BRAND_OWNER` | 소속 브랜드 전체 + 금전 행위(샘플 요청·발주·재동의) + 담당자 초대·권한 위임 | ko |
| 브랜드 member | `BRAND_MEMBER` | 요청·셀렉·코멘트·샘플 피드백·검수 보고. `can_purchase=true`면 금전 행위 가능 | ko |

역할은 `auth.users.app_metadata.role`(JWT)로만 부여한다. profiles 테이블에 role 컬럼을 두지 않는다. 브랜드에는 등급 `tier: new | proven`(샘플비 선입금 여부)과 `fee_rate`·`hidden_margin_rate` 오버라이드가 있다.

권한 매트릭스는 기획서 03장과 동일. 핵심만:
- 상품 등록: ADMIN, CN_*. 검수·제안 발행·재제안·물류 견적·발주 확정·입금 확인·검품: ADMIN만.
- 셀렉·코멘트·피드백·검수 보고: BRAND_*. 샘플 요청·발주·재동의: BRAND_OWNER 또는 can_purchase member.
- 재고 확인 응답·샘플 출고·재확인: CN_*(본인 상품).

## 3. 객체 모델 (요약) — "제안은 링크 1행"

```
request ─┬─ request_item (status, owner_role, due_at, ai_tags) ─┬─ offer ──┐
         └─ request_image                                        │          │
vendor ─── product ─┬─ product_cost (원가 tier, vendor_code)     │          │
                    ├─ product_image / color / size / variant    │          │
                    └─ product_label_option / mod_option (원청 기본값 상속)  │
offer (= product_brand_link): product × brand × request_item(nullable) × 가격 고정
sample_request (브랜드, 묶음, logistics_fee, payment gate) ─ sample_item (variant, offer, inspection, return, charge)
order (브랜드, 공구 단위, 일정×3, hold, deposit, quotes, route, label_selections, invoice_snapshot) ─ order_line (variant, offer, qty, stock_result, backorder)
inspection (sample|bulk, checklist 결과 = 상품 필드 1:1, photos, defect_qty)
comment (target_type, target_id, visibility, body_ko, body_zh) · cn_question (options, admin_gate_until, answer)
export_package (brand, products, shop_type, files, status) · channel_connection (2차)
notification · setting(+history) · glossary · audit_log · brand_application · brand_member
```

## 4. 상태 (enum) 와 담당자·기한

모든 상태 객체는 `status`, `owner_role`, `due_at`를 가진다. 전이는 서버 액션의 `assertTransition()`만 수행.

```
request_item:  received | needs_info | assigned | sourcing | offered | selected | closed | on_hold | cancelled
               request는 status 컬럼 없이 항목에서 집계: needs_info > offered(selected 포함) > sourcing(assigned 포함) > received > on_hold > closed, 전부 취소면 cancelled
               기한: received→ADMIN 1영업일, sourcing→CN sla_date, offered→BRAND 독점 14일
product:       draft | pending_review | reviewed | offering | repool | rejected | recheck | hidden
               기한: pending_review→ADMIN 2영업일
offer:         new | interested | hold | declined | recheck | reconsent_pending | expired
               기한: new→BRAND exclusive_until(14일), reconsent_pending→BRAND 3일
sample_request: requested | awaiting_payment | cn_shipped | kr_arrived | inspected | sent_to_brand | delivered | feedback_done | closed | cancelled
sample_item:    pending | ok | defect | unavailable ; return_status: due | returned | kept ; charge_status: none | charged | deducted
               기한: cn_shipped→CN 3일, feedback→BRAND 14일, return→BRAND 14일
order:         reserved | stock_checking | stock_confirmed | partial_confirmed | stock_short | deposit_pending | hold_confirmed |
               quoting | quoted | qty_confirmed | final_quoted | confirmed | cn_shipped | kr_inspecting | sent_to_brand | delivered | report_done | cancelled
order_line:    stock_result: pending | confirmed | short ; backorder: none | backordered(qty, eta, log) | resolved
               기한: stock_checking→CN 2일, deposit_pending→BRAND 3일, quoting→ADMIN 2영업일, delivered→BRAND 검수 보고 7일
feedback / reaction 어휘 통일: interested | hold | declined (+ decline_reason: price | design | fabric | leadtime | other)
brand_application: pending | approved | rejected
```

전이 규칙 요점:
- 제안 발행 조건: product=reviewed 이상, 공개 조건 중 **필수** 전부 충족.
- 공개 조건 (2026-11-09 완화 — 현장에서 정보를 다 못 채워도 진행):
  - **필수**(검수 요청·제안 발행을 막는다): 사진≥1(참고용 제외), 원가 구간≥1, vendor 연결, 컬러≥1, 사이즈≥1 — 가격 계산과 variant의 원천.
  - **권장**(체크리스트에 미충족으로 표시만): verified_in_person, 사진≥5(자체 촬영 실물컷 포함), sample_ok, 혼용률 합 100%, 원산지, 세탁, min_qty, weight_g(없으면 샘플 물류비 0원으로 계산), hold 조건(상속 포함), supply_type(생산·혼합이면 lead_days·production_moq).
  - 공개 상품 수정 가드는 필수 조건만 본다.
- 공개(reviewed·offering·repool) 상품에서 CN이 원가 구간·공급 형태·리드타임·생산 MOQ·최소 수량·홀딩·원청을 바꾸면 recheck(`recheck_reason`에 필드명). 사진·설명·소재 수정은 재확인 없음.
- 발주서에 담기 조건: offer=interested AND 해당 offer의 sample feedback=interested. 예외: 리오더(동일 product 발주 이력) 또는 ADMIN 면제 플래그.
- 샘플 피드백 등록 시 offer.reaction 동기화.
- product recheck → 걸린 offer 전부 recheck → 재승인 → 가격 변동 시 reconsent_pending, 동일하면 이전 reaction 복원.
- 발주 체인: reserved → stock_checking(제출 즉시, O1) → (stock_confirmed|partial) → [선금 홀딩이면 deposit_pending → hold_confirmed] → quoting → final_quoted(견적 1회, O2) → confirmed → … (quoted·qty_confirmed는 2026-11-10 전 발주서 호환)
- 최종 견적 동의(2026-11-04 Jay 결정 P1): final_quoted는 **브랜드 차례**(구매 권한, 3일). 브랜드가 미리보기 총액에 "이 금액으로 진행"을 누르면 동의(감사 로그 `order.final_approve`, 총액·시각·대행 여부)가 남고 위아더 차례로 넘어간다. 관리자 확정(confirmed)은 **final_quoted_at 이후의 동의가 있고 그 총액이 지금 계산과 같을 때만** 서버가 허용한다. 최종 견적을 다시 내면 이전 동의는 무효.
- partial_confirmed 시 라인 qty ≤ 확보 수량. 수량 수정 요청은 confirmed 이후 1회, ADMIN 승인.

### 업무 단순화 v1 (2026-11-10 Jay 결정 — 사람은 판단만, 넘기기는 시스템)
테스트 인원 투입 전 손 넘김 31 → 17 목표. 상태값(enum)은 그대로 두고 버튼·자동 전이로 줄인다. 모든 자동 전이도 서버에서 `applyTransition`(감사·SLA)으로.
- **R1 요청 자동 배정**: 설정 `auto_assign`(카테고리 → CN 담당자, 없으면 기본 담당자)이 있으면 브랜드 요청 제출 즉시 항목을 assigned로 넘기고 중국어 번역을 붙인다. 번역 불확실·카테고리 미지정·담당자 없음이면 지금처럼 received(위아더 차례)에 남는다. 위아더는 보완 요청·재배정만.
- **P1** CN 상품 상세 하단 고정 바에서 필수 5개 충족 시 바로 "검수 요청". **P2** 관리자 상품 검수 화면 "승인하고 제안 보내기" 한 번 = 검수 승인 액션 → 제안 발행 액션을 차례로(서버 액션은 분리 유지, 절대 규칙 3).
- **B1** 브랜드 제안 "샘플 받아보기" = 관심 표시 + 샘플 요청서로 이동(수량 기본 1).
- **S1** 관리자 샘플 검품 저장 시 cn_shipped면 kr_arrived를 함께 기록(도착 버튼 생략). **S2** 브랜드 피드백 저장 시 sent_to_brand면 delivered 자동, 피드백 화면에서 돌려보내기/구매를 함께 고른다. **S3** 샘플 요청서는 모든 항목이 회수(returned) 또는 구매(kept·charged)로 끝나면 자동 closed.
- **O1** 브랜드 발주서 제출 = 곧바로 stock_checking(CN 차례). 관리자 "재고 확인 요청" 생략.
- **O2 견적 1회**: 재고 확인(·홀딩 확정) 뒤 관리자가 견적을 한 번 낸다(quoting → final_quoted로 바로, 물류비는 **예상 금액** `logistics_quote_final_krw`). 브랜드는 final_quoted에서 확보 수량 안에서 수량을 조정하며 한 번 동의, 관리자 확정. quoted·qty_confirmed는 예전 발주서 호환용으로만 남는다. **실제 물류비 정산**: 출고 뒤 관리자가 실제 물류비를 넣으면 차액은 청구에 정산 항목으로 붙는다. 실제가 예상보다 **10% 넘게 많으면** 브랜드 재동의(차액 동의)를 받은 뒤에만 청구에 붙는다.
- **O3** 관리자 본품 "검품·발송 완료" 한 번 = cn_shipped → kr_inspecting → sent_to_brand(운송장 필수). 직송은 지금처럼 sent_to_brand 바로.
- **O4** 브랜드 "받았어요 · 이상 없음 / 문제 있음" 한 번 = delivered + report_done(문제 있음은 보고 폼). sent_to_brand 후 **7일** 무응답이면 cron이 delivered → report_done(이상 없음, 자동 표시)으로 닫는다. 그 뒤 불량 접수는 위아더가 코멘트로 받아 크레딧 처리.
- **O5** 입금 확인 = hold_confirmed까지 한 번. 홀딩 조건 없는 상품은 선금 단계를 화면에 보이지 않는다.
- **C1** 할 일 행에서 판단 없는 처리(운송장 입력·출고)는 상세로 들어가지 않고 바로.

## 5. 데이터 모델 (Supabase)

공통: `id uuid pk`, `created_at`, `updated_at`. 브랜드 측 테이블은 `brand_id` 필수.

```
profiles            id(=auth.users.id), display_name, locale, phone, is_active            -- role 없음(JWT)
brands              id, slug(unique), name, type, tier(new|proven), channels jsonb, fee_rate numeric null, hidden_margin_rate numeric null,
                    default_address jsonb, credit_balance_krw int default 0, status, approved_at
brand_members       brand_id, profile_id, level(owner|member), can_purchase bool, invited_by, joined_at  unique(brand_id, profile_id)
brand_applications  brand_name, type, channels, category_focus text[], follower_scale, contact_*, biz_reg_no null, is_ecommerce_registered bool,
                    cn_content_optin bool, note, status, reviewed_by, reviewed_at, created_brand_id
vendors             name, market, booth, wechat, card_image_path, default_hold jsonb{deposit_pct, days, none}, default_sample_ok bool,
                    default_label_options jsonb[], default_mod_options jsonb[], trust_score numeric, notes
requests            brand_id, created_by, title, memo, memo_zh, target_date, status(집계), created_via(brand|admin_proxy)
request_items       request_id, seq, category, description, description_zh, target_price_krw null(공급가 기준), expected_qty_range(코드: lt30|30_100|100_300|300_1000|gt1000|tbd),
                    status, owner_role, due_at, assigned_to, sla_date, ai_tags jsonb
request_images      request_item_id null(미분류면 request_id), storage_path, source_url, sort_order
products            vendor_id, created_by, source_request_item_id null(C-01 "상품 추가" 진입 항목), verified_by, code(OS-26FW-0001, 공개 시 발급), status, category, name_zh, name_ko, desc_zh, desc_ko,
                    fabric jsonb[{material_code, pct}], origin, care_codes text[], quality_note_zh/ko, show_quality_note,
                    supply_type(stock|production|mixed), lead_days, production_moq, min_qty, weight_g,
                    verified_in_person bool, verified_at, verified_place, sample_ok bool, sample_cost_cny,
                    hold_override jsonb null, label_options_override jsonb null, mod_options_override jsonb null,
                    (vendors.owner_profile_id: CN_VENDOR 계정이 고정되는 원청. CN_VENDOR는 원청 생성·변경 불가)
                    reviewed_by, reviewed_at, rejected_reasons text[](템플릿 코드), recheck_reason
product_costs       product_id, tiers jsonb[{min_qty, cost_cny}], vendor_code, source_market, notes         -- 브랜드 역할 접근 불가
product_images      product_id, storage_path, kind(real|model|detail|label|size_chart), source(own|vendor|reference), usable_for_sales bool, sort_order, color_id
product_colors      product_id, name_zh, name_ko, hex, sort_order
product_sizes       product_id, label, measurements jsonb, source(vendor|measured), sort_order
product_variants    product_id, color_id, size_id, sku                                                 unique(product_id,color_id,size_id)
offers              product_id, brand_id, request_item_id null, type(request|reoffer|recommend), reaction, decline_reason, decline_note,
                    price_tiers jsonb[{min_qty, product_price_krw}], fee_rate, hidden_margin_rate, fx_rate, sample_fee_product_krw,
                    valid_until, exclusive_until, issued_by, issued_at, reacted_by, reacted_at, status, owner_role, due_at
                    unique(product_id, brand_id, request_item_id)
sample_requests     brand_id, requested_by, status, owner_role, due_at, ship_to jsonb, logistics_fee_krw, product_fee_total_krw(미회수 시),
                    payment_required bool, payment_reported_at, payment_confirmed_at, cn_tracking, cn_shipped_at, kr_arrived_at,
                    inspected_at, kr_tracking, sent_at, delivered_at, feedback_due, return_due
sample_items        sample_request_id, offer_id, variant_id, qty int default 1 (variant당 샘플 수량, 상한 settings.sample_qty_max), status, inspection_id, feedback(interested|hold|declined), feedback_note,
                    return_status, returned_at, charge_status, charged_krw, deducted_in_order_id
orders              brand_id, created_by, status, owner_role, due_at, gb_open_date, gb_close_date, delivery_promise_date,
                    hold_choice(deposit|none), deposit_krw, deposit_reported_at, deposit_confirmed_at,
                    route(inspect|direct), logistics_quote_range jsonb, logistics_quote_final_krw, quote_note,
                    label_selections jsonb, mod_requests jsonb, invoice_snapshot jsonb, admin_memo, confirmed_by, confirmed_at,
                    cn_shipped_at, kr_inspected_at, inspection_id, sent_at, delivered_at, report_due, report jsonb, credit_issued_krw
order_lines         order_id, offer_id, variant_id, expected_qty, qty, unit_price_krw, stock_result, confirmed_qty,
                    backorder_status, backorder_qty, backorder_eta, backorder_log jsonb[]
inspections         type(sample|bulk), target_id, template_id, results jsonb[{field, expected, actual, match bool, note}], photos text[],
                    defect_qty, inspected_by, inspected_at, info_match_rate numeric
inspection_templates category, checklist jsonb[]
comments            target_type, target_id, author_id, visibility(brand|internal|cn), body_ko, body_zh, created_at
cn_questions        request_item_id, product_id null, asked_by, body_zh, body_ko, options jsonb[], admin_gate_until, released_at,
                    answer, answer_zh, answered_by, answered_at
export_packages     brand_id, product_ids uuid[], shop_type(cafe24|godo|imweb|smartstore), files jsonb, status, created_at
notifications       recipient_id, kind(instant|digest), type, title, body, link_path, read_at, sent_at, channel
settings            key, value jsonb, updated_by, updated_at  + settings_history
glossary            term_zh, term_ko, category, approved bool, added_by
audit_logs          actor_id, action, entity, entity_id, diff jsonb, on_behalf_of_brand_id null
sales_reports / contents / cn_seller_links / channel_connections   -- 2차, 키만 예약
```

설정 키: `fx_rate_cny_krw`, `hidden_margin_rate`(0.20), `fee_rate`(0.20), `sample_air_per_kg_krw`(15000), `domestic_shipping_krw`, `logistics_estimate_per_kg_krw`, `customs_estimate_rate`, `exclusive_days`(14), `offer_valid_days`(30), `fx_recheck_pct`(0.03), `sample_feedback_days`(14), `sample_return_days`(14), `sample_qty_max`(3), `report_days`(7), `cn_question_gate_hours`(4), `review_sla_days`(2), `min_lead_days`(14, 희망 납기 경고 기준), `categories`, `measurement_templates`, `label_option_types`, `decline_reasons`, `rejection_templates`, `wecom_webhook_url`.

## 6. 접근 제어

- 브랜드 역할: `products`, `product_costs`, `vendors`, `glossary`, `settings` 테이블 SELECT 권한 자체를 revoke. 브랜드는 `v_offers_brand`, `v_products_brand`, `v_product_images_brand`, `v_product_colors_brand`, `v_product_sizes_brand`, `v_product_variants_brand` 뷰(security_invoker)로만 읽는다. 뷰는 `exists(offer where brand_id in auth_brand_ids())` 조건을 포함하고 원가·원청·녹인 마진·환율·중국어 원문·중량을 제외한다. 브랜드가 보는 가격은 offer의 `price_tiers`와 `fee_rate`로만 계산.
- 요청 영역(3단계): 브랜드는 `v_requests_brand`, `v_request_items_brand`로만 읽는다(`*_zh`·`assigned_to`·`ai_tags` 제외, `sla_date`는 "예상 제안일"로 노출). `requests`·`request_items`는 컬럼 단위 select grant로 중국어 원문 컬럼을 막는다.
- 상태가 있는 테이블(requests, request_items, request_images, products, offers, sample_requests, sample_items, orders, order_lines, cn_questions)은 `authenticated`의 insert·update를 revoke한다. 쓰기는 Server Action(역할·멤버십 검증 → `assertTransition` → `ownerAndDue` → 서비스 롤)만. RLS 정책은 방어 겹으로 유지.
- 상태 이력(타임라인)은 `audit_logs(action='transition', diff{from,to})`에 남기고 서버가 역할별로 가공해 보여준다(별도 이력 테이블 없음).
- 브랜드 측 테이블 RLS: `brand_id in auth_brand_ids()`. delete 금지. 존재하지 않는 slug와 권한 없는 slug는 동일 404.
- CN: 배정된 request_items, 본인 created_by 상품(CN_VENDOR는 자기 원청 상품 읽기 전용 추가), 본인 상품에 걸린 sample/order 라인(브랜드 식별 정보는 뷰에서 마스킹 — CN_VENDOR). 희망 단가는 CN_SOURCER만.
- 역할은 JWT `app_metadata.role`. 서비스 롤 키는 서버 전용.
- Storage: 모든 버킷 비공개 + 서명 URL. `product-images`(CN/ADMIN 쓰기, 브랜드는 offer 걸린 상품만 읽기), `request-images`, `sample-photos`, `inspection-photos`, `vendor-cards`(ADMIN/CN만), `exports`.
- 번역 서버 액션은 원가 필드를 입력으로 받지 않는다(타입 레벨 차단).

## 7. 가격·비용 계산 (`lib/pricing.ts`, 순수 함수)

```
product_price_krw(tier) = ceil10( cost_cny(tier) × fx_rate × (1 + hidden_margin_rate) )
supply_price_krw(tier)  = ceil10( product_price_krw(tier) × (1 + fee_rate) )          -- 화면 메인 숫자
hidden_margin_rate = brand ?? settings ; fee_rate = brand ?? settings   (상품 단위 마진 override는 두지 않는다 — 발행 시 수동 조정이 필요하면 offers.admin_price_adjust_krw + 감사 로그로. COWORK_DECISIONS 2026-11-01)
sample_logistics_fee   = ceil10( Σ qty × weight_g/1000 × sample_air_per_kg_krw ) + domestic_shipping_krw   -- 한 금액으로 노출
sample_product_fee     = Σ qty × product_price_krw(min tier) per item                                -- 미회수 시 청구
order subtotal         = Σ qty × product_price_krw(tier by 발주 총수량)   → fee = subtotal × fee_rate
option fees            = Σ label/mod option (qty 기준 단가 × 환율 × (1+hidden_margin)) → 수수료 미적용
sample deduction       = 0 (2026-11-09부터 차감 없음 — 구매 샘플은 샘플 청구에서 따로. 그 전에 확정된 발주의 차감 기록은 그대로 둔다)
deposit                = (subtotal + fee) × deposit_pct (예상 수량 기준) → 확정 수량으로 정산
total                  = subtotal + fee + options − sample deduction − deposit paid − credit + logistics_final (메모)
```
원가·환율·녹인 마진은 브랜드 응답에 절대 포함하지 않는다. 금액은 정수 KRW, 원가는 numeric(10,2) CNY.

## 8. 화면 (MVP 26 + 2차)

공개: P-01 랜딩·브랜드 신청(채널톡 위젯, cn_content_optin) · P-02 로그인(OTP/Kakao, CN·ADMIN 비밀번호) · P-03 초대 수락
브랜드 `/b/{slug}`: B-01 홈("지금 당신 차례" 카드, 청구 예정, 타임라인) · B-02 요청(필수: 이미지/링크 1 + 한 줄; 항목 여러 개 허용, 기본 1·최대 20; 예상 수량은 구간 select; 희망 납기가 오늘+min_lead_days보다 빠르면 경고만) · B-03 요청 목록·상세(타임라인) · B-04 내 요청에 온 제안(항목별 라인시트, PDF) · B-05 상품 상세 · B-06 샘플 요청서(묶음, variant별 수량 입력) · B-07 샘플 현황(회수) · B-08 발주서(2단계) · B-09 발주 현황·미송·검수 보고 · B-12 쇼핑몰로 상품 보내기(표준 패키지) · (2차) B-10 설정, B-11 판매 보고·콘텐츠
중국 `/cn`: C-01 내 요청 항목(상품 추가, 브랜드에 질문) · C-02 모바일 등록(사진 1장+원가+원청, 임시저장, 오프라인 큐) · C-03 PC 상세(원청 상속, 공개 조건 체크리스트, **임시저장·반려 상태이고 제안이 한 번도 없는 내 상품은 삭제** — 사진도 함께 지움) · C-04 내 상품 · C-05 처리 큐
관리자 `/admin`: A-01 대시보드(지연 순 큐, KPI 보드) · A-02 요청 접수·배정(항목 정리, 대행 입력, 보완 요청, CN 질문 게이트) · A-03 상품 검수(품질만, 템플릿 반려, 원클릭 승인) · A-04 제안 발행·상품 관리 · A-05 샘플 관리(입금·검품·회수·라이브러리) · A-06 발주 관리(재고→선금→견적→확정→미송→검품→검수 보고) · A-07 브랜드 관리(등급·수수료·크레딧) · A-08 설정·원청·용어 사전·검품 템플릿

화면별 필드·검증은 기획서 10장(양식 설계)을 따른다. 모바일 우선: C-02, B-04, B-05, B-06, B-07, B-08.

## 9. 소통·알림·번역

- 핸드오프 카드: 담당자·기한·결정할 것·정보·CTA. 기획서 11장 핸드오프 표 14건이 이벤트 정의다.
- 알림 2등급: instant(공이 넘어옴, 기한 초과, 예상 제안일 초과, 재확인으로 가려진 사유) / digest(진행 상황 1일 1회). 브랜드 이메일+인앱, CN WeCom webhook(담당자명+딥링크), ADMIN 인앱+이메일.
- **새 소식 표시(2026-11-09 사이트 수정 7·8)**: 읽지 않은 알림이 걸린 대상(요청 항목·요청·상품·샘플·발주)은 목록 첫 화면(A-01 할 일, C-01 내 요청 항목, 브랜드 홈 진행)에서 "새 소식" 칩으로 표시하고, 그 대상 상세를 열면 해당 알림을 읽음 처리한다. 24시간 안에 생긴 행의 "새" 칩은 그대로. 첫 화면 위에 읽지 않은 새 소식 최대 5건을 모아 보여 주고 전체는 알림 화면으로.
- 통합 comments + cn_questions(4시간 게이트). 거절 사유 탭 + 한 줄, 용어 사전 적용 자동 번역.
- 번역: 구조화 필드는 번역 없음. 자유 텍스트만 LLM(글로서리 주입) → 역번역 비교 → 불확실 하이라이트. 반려·검품·미송·입금 안내는 템플릿.
- 돈 흐름: 입금 안내 카드(계좌·금액·기한·미입금 결과) + "입금했어요" 신고 + 관리자 확인. 청구 예정 금액 상시 노출. 발주 확정 시 invoice_snapshot → 수동 발행용 엑셀/PDF.

## 10. 쇼핑몰 상품 보내기 (B-12)

- 입력: 발주 확정 또는 샘플 채택 상품, 대상 쇼핑몰 타입.
- 출력: 쇼핑몰별 상품 등록 엑셀 양식(카페24·고도몰·아임웹·스마트스토어 각각의 컬럼 매핑) + 이미지 zip(usable_for_sales=true 사진만, 리사이즈·순서) + 상세 HTML 템플릿(혼용률·사이즈표·세탁·원산지 자동 삽입).
- 매핑 테이블은 `lib/exports/{shop}.ts`에 두고 쇼핑몰 양식 변경에 대비해 버전 관리.
- 2차: channel_connections + 각 쇼핑몰 앱/API로 "보내기" 버튼 → 등록 초안 생성. 개발자 계정·앱 심사는 MVP 중 신청.

## 11. 비기능

- `/cn` 라우트 외부 의존 금지, 폰트 셀프호스팅, 초기 JS < 200KB. 업로드 클라이언트 리사이즈(2000px WebP 0.85), 서명 URL 직접 업로드 실패 시 서버 프록시 업로드, 오프라인 로컬 큐.
- 감사 로그: 대행·가격 수정·발주 확정·입금 확인·환율/마진 변경.
- 보안 테스트: 브랜드 세션으로 모든 라우트·액션 순회 시 응답에 `cost_cny|vendor|hidden_margin|fx_rate|_zh|weight_g|booth` 키 없음. 브랜드 A로 브랜드 B 리소스 전부 404.
- 성능: B-04 100 제안 LCP < 2.5s.

## 12. 수용 기준

- [ ] 원가·원청·녹인 마진·환율·중량·중국어 원문이 브랜드 응답 어디에도 없다(자동 테스트).
- [ ] 브랜드 간 격리 404(자동 테스트). slug 존재 여부 구분 불가.
- [ ] 공개 조건 중 필수 미충족 상품은 검수 요청 버튼이 비활성이고 서버도 거부한다.
- [ ] 검수 승인은 product만 바꾸고 브랜드에게 보이지 않는다. 제안 발행 시에만 offer가 생기고 가격이 고정된다.
- [ ] 같은 상품 재제안 시 products 행이 늘지 않고 offers만 는다. 원본 브랜드는 다른 브랜드 offer를 볼 수 없다.
- [ ] 요청 항목 상태가 제안·반응에 따라 자동 집계된다. 모두 거절 시 sourcing 복귀 + CN 알림.
- [ ] 발주서 담기 조건(offer interested AND sample feedback interested)을 서버가 강제한다.
- [ ] 발주 체인 순서를 건너뛸 수 없다. 선금은 stock_confirmed 이후에만 안내된다.
- [ ] 샘플 요청서는 variant별 수량(1~sample_qty_max)을 받고 합 1 이상이어야 생성된다. 샘플 물류비는 한 금액으로만 노출되고, 회수 등록 시 상품가 청구가 생기지 않으며, 미회수(구매) 청구분은 샘플 청구에만 잡히고 발주 금액에서 차감되지 않는다.
- [ ] 모든 상태 객체에 owner_role·due_at이 있고 A-01 큐가 지연 순으로 정렬된다.
- [ ] 알림이 항목 단위 다이제스트로 묶인다(제안 7개 발행 → 브랜드 1통).
- [ ] CN 질문은 4시간 후 자동으로 브랜드에 노출된다(관리자 보류 시 제외).
- [ ] 검품 결과의 info_match_rate가 계산되어 KPI 보드에 뜬다.
- [ ] B-12가 4개 쇼핑몰 양식의 엑셀과 이미지 zip을 생성한다.
- [ ] 번역 서버 액션 입력 타입에 원가 필드가 없다.

## 13. 개발 순서

1. 셋업: 스키마·enum·RLS·뷰·권한 revoke·설정 시드·`lib/config.ts`(서비스명·도메인 상수). 시드: ADMIN 1, CN 1, 원청 2, 브랜드 2(+owner/member), 요청 1, 상품 3.
2. 인증 3종 + 역할 레이아웃 + `/b/{slug}` 가드 + 초대 수락(P-02, P-03).
3. 요청: B-02, B-03, A-02(항목 정리·대행 입력·보완 요청), C-01.
4. 상품: C-02(모바일, 오프라인 큐), C-03(원청 상속, 체크리스트), C-04, 원청 관리(A-08 일부).
5. 검수·발행: 번역 파이프라인·용어 사전, A-03, A-04, B-04 라인시트·PDF, B-05.
6. 샘플: B-06, B-07, C-05, A-05, 입금 안내 카드, 회수·청구.
7. 발주: B-08 2단계, A-06 체인, 미송 관리, 검품 템플릿·리포트, B-09 검수 보고·크레딧.
8. 소통·알림: comments, cn_questions, 2등급 알림, 이메일·WeCom, 타임라인, 핸드오프 카드, A-01 큐·KPI.
9. B-12 쇼핑몰 패키지, P-01 랜딩·신청, A-07 브랜드 관리.
10. 보안 E2E, 중국 현지 업로드 테스트, 성능.

## 14. 설정 초기값 (개발 전 입력)

fx 200(참고) · hidden_margin 0.20 · fee 0.20 · 샘플 특송 15,000/kg · 국내 배송비(결정 필요) · 운송·통관 추정 단가(결정 필요) · 기간 규칙은 D13·D15·D16·D17 값 · Kakao OAuth·WeCom·Resend 계정 주체 확인 · 쇼핑몰 개발자 계정 신청.
