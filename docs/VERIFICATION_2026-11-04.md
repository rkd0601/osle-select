# 전체 개발 검증 보고 — 2026-11-04

대상: `C:\Users\one\dev\osle-select` 2026-11-04 00:09Z 상태(마이그레이션 0001~0052, 14단계까지 + 개발자 로컬 세팅 커밋). 이전 라운드 델타가 아니라 **저장소 전체**를 네 갈래(보안·권한·인증 / 돈·전이 로직 / PRD 커버리지 / 운영 경로)로 독립 검토했다. 결과는 **HIGH 0 · MED 6 · LOW 15**, MED 6건은 이 보고와 함께 고쳐 넣었다(0053).

## 1. 게이트

| 항목 | 결과 |
|---|---|
| vitest | **215 / 215**(검증 후, 스냅샷 테스트 2 추가) |
| tsc · eslint · `next build` | 통과 (First Load 공통 123kB, `/login` 140kB) |
| 로컬 PG 체크 (`pnpm db:check`) | **39 / 39**(0053 체크 39 추가) |
| PGlite 러너 (`pnpm db:check:lite`) + 운영 사전 점검 | 통과 (시드 흔적만 검출 — 의도) |
| E2E (Playwright 9 스펙) | 개발자 PC에서 클라우드 DB로 **7 통과 · 2 skip**(STEP14 §4). Cowork 샌드박스는 외부 DB(supabase.co) 접속이 막혀 재실행 불가. skip 2건은 시드 보강으로 풀린다(원청 계정·발주 확정 상품) |

## 2. 고친 것 (MED 6, 0053 + 코드)

| # | 영역 | 결함 | 수정 |
|---|---|---|---|
| A-1 | 권한 | 브랜드 owner가 PostgREST로 `brand_invites`에 직접 insert하면 `level='owner'`·구매 권한·만료를 마음대로 넣을 수 있었다(0007 정책이 level을 안 봄 → "owner 초대는 ADMIN만" 코드 가드 우회) | **0053** `revoke insert/update/delete on brand_invites`, 정책 삭제. 초대는 이미 서버 액션뿐. SQL 39a |
| A-2 | 원가·내부 비노출 | 브랜드가 `inspections` 테이블을 직접 읽으면 공개 전(검품 중) 결과·사진 경로·검품자 id가 보였다(0003 정책 + 전체 컬럼 grant). 앱 화면은 뷰만 써서 노출 없음 | **0053** 테이블 select revoke + 정책 삭제. 브랜드는 `v_inspections_brand`(definer)만. SQL 39b |
| B-1 | 돈 | 담긴 제안이 재확인(recheck)→재승인되면 `offers.price_tiers`가 즉시 새 값으로 바뀌는데, 발주 계산(`loadOrderForCalc`)이 그걸 라이브로 읽어 **브랜드 재동의 전에 새 가격으로 선금·견적·확정**이 될 수 있었다 | `loadOrderForCalc`가 `offersChanged`(recheck/reconsent_pending 포함)를 돌려주고 `requestDeposit`·`draftRangeQuote`·`confirmOrderQuantities`·`confirmOrder`가 `order.error.offerChanged`로 거부. 근본 해법(담은 시점 가격 스냅샷)은 DECISIONS v-1 |
| B-2 | 돈 | 불량 크레딧 발행: 상태 읽기 → `credit_brand` RPC → `orders.update` 순서라 관리자 둘이 동시에 누르면 잔액이 **2배 적립** | **0053** `issue_order_credit(order, amount, actor, suggested)` — 행 잠금 후 1회만 적립+표시+감사(한 트랜잭션). 액션은 RPC 호출로. SQL 39d~f |
| D-1 | 수출 | 발주 확정 시 패키지 스냅샷의 금지어 검사가 JSON 전체를 보는데 `sizes[].source:"vendor"`(출처 enum)가 `\bvendors?\b`에 걸려 **원청 사이즈표 상품은 전부 스냅샷에서 빠졌다**(DECISIONS 9-7 무력) | `snapshotText()`가 enum 값을 빼고 검사. 단위 테스트 2 |
| D-2 | 비밀값 | 루트의 `osle-select 로컬 셋팅.zip`(558MB, `.env.local` 포함)이 `.gitignore`·`.vercelignore`에 없어 커밋·배포 업로드에 실릴 수 있었다 | 두 파일에 `*.zip` 추가. **zip 파일 자체는 저장소 밖으로 옮길 것** |

## 3. 확인된 것 (OK)

- **원가 비노출**: 0001~0053 최종 상태에서 `authenticated`가 읽을 수 있는 테이블·컬럼 전수 추적 — `product_costs`·`vendors`·`settings`·`glossary`·`audit_logs`·`brand_applications`·`vendor_channels` 접근 없음, `offers`/`requests`/`request_items`/`orders`는 컬럼 grant로 `fx_rate`·`hidden_margin_rate`·`*_zh`·`admin_memo` 제외, definer 뷰는 컬럼 열거 + `strip_cost_keys` + recheck 가림. jsonb(`invoice_snapshot`·`export_snapshots.data`·옵션)에도 원가 키 없음.
- **브랜드 분리**: `app/b/[slug]/**` 서버 액션 32개 전부 `requireBrandAccess` 뒤 `brand_id` 재필터, Storage 경로는 서버 생성 + 접두어 검증, 수출 다운로드 `brand.id/` 접두어만 서명.
- **CN 분리**: 상품은 `created_by`, 항목은 `assigned_to`, 원청은 자기 `vendor_id`만, 마스킹 뷰(`v_*_cn`) definer.
- **인증(14단계 서버 액션)**: `safeNext` 오픈 리다이렉트 차단, OTP 실패 메시지 단일, `shouldCreateUser:false`, 초대 수락은 세션 이메일=초대 이메일·만료·기존 owner 강등 없음, 브라우저 Supabase 클라이언트 0.
- **가격·청구**: 10원 올림 부동소수 보정, tier 경계, 선금·물류비·미회수 차감 1회·크레딧 1회(`use_brand_credit_for_order`)·`total=max(0,raw)`·`refund_due_krw` — 수치를 실제 함수로 재계산해 확인. PG·결제·세금계산서 코드 0(규칙 13).
- **전이표**: PRD 4장 상태 집합 일치, 발주 체인 우회 간선 없음, 구매 전이 `canPurchase`, 취소 범위, `assertTransition` 밖 상태 변경은 트리거 3개(발행·샘플 피드백·recheck 캐스케이드)와 크론 2곳(모두 `applyTransition`)뿐.
- **알림·크론**: `notify` 타입 46개 전수 등록(컴파일 강제), 선점/임대/3회 실패, digest 09:00 KST, 코멘트 묶기, 원청 웹훅만, 크론 7개 멱등(`firstAlert`), Bearer 상수 시간.
- **수출·번역·이미지**: SPEC 20열, 금지어 스캔 전 파일, CSV 주입 방지, zip 대칭, 사진 own+usable, 120장/48MiB; 번역 원가 타입 차단·approved만 주입; 이미지 2000px WebP·프록시 폴백·경로 접두어; `/cn` 외부 의존 0.
- **PRD 수용 기준(§12)** 15개 중 14개 ✅, 1개는 DECISIONS 9-5(표준 패키지)로 범위 변경.

## 4. 개발자에게 넘기는 것 (LOW 15 + 커버리지 공백)

### LOW (운영 전 권장, 전부 S)
| # | 내용 | 파일 |
|---|---|---|
| L1 | 세션 쿠키 `httpOnly:false`(@supabase/ssr 기본) — 브라우저 클라이언트가 0이 됐으니 `cookieOptions:{httpOnly:true, sameSite:"lax", secure}` | `lib/supabase/server.ts`, `middleware.ts` |
| L2 | 카카오 `redirectTo`가 요청 `Origin` 기반 → `NEXT_PUBLIC_APP_URL` 고정 | `app/(public)/login/actions.ts:43` |
| L3 | `comments.body_zh`가 브랜드 세션 컬럼 grant에 포함(브랜드 가시 코멘트의 번역본이라 민감도 낮음; CN 세션이 같은 컬럼을 써서 정책 분리 필요) | 0003/0005 |
| L4 | OTP 발송·검증·신청 폼 레이트 리밋은 Supabase Auth 기본값 의존 — 운영 전 Auth Rate Limits 값 확인(DEPLOY_CHECKLIST에 추가) | — |
| L5 | 재승인 "가격 같음" 판정이 `price_tiers+fee_rate`만 비교 → 옵션 단가·샘플 물류비는 조용히 바뀜. 비교에 `option_prices` 포함 | `app/admin/products/actions.ts:161`, DECISIONS STEP5 #3 |
| L6 | PRD "확정 후 수량 수정 1회" 미구현(`qty_change_count` 컬럼만) — PRD에서 빼거나 2차 표기 | PRD 4장 |
| L7 | PRD 7장 "tier by 발주 총수량" ↔ 코드 "제안별 총수량"(코드가 맞음) — PRD 문구 수정 | PRD 7장 |
| L8 | 크론 라우트 `maxDuration` 없음(digest 최대 5000행) → `export const maxDuration = 300` | `app/api/cron/[job]/route.ts` |
| L9 | 알림 수신자 계산이 `profiles.is_active`를 안 봄 → 비활성 계정 제외 | `lib/notify.ts`, `lib/notify-delivery.ts#recipients` |
| L10 | 수신자가 Auth에 없으면 조용히 3회 소모 → `no_recipient`로 닫기 | `lib/notify-delivery.ts:104` |
| L11 | 링크 기본 도메인 `https://select.osle.shop` 하드코딩 폴백 → 운영 판정이면 error | `lib/config.ts:7` |
| L12 | `sla_alerts` 매 실행 2,500 upsert·무한 누적 → anti-join 또는 보존 기간 | `lib/cron-jobs.ts:17` |
| L13 | `e2e.yml`에 `E2E_CN_VENDOR_EMAIL` 없음 → CI에서 CN masking 스펙 항상 skip | `.github/workflows/e2e.yml` |
| L14 | `setup-staging.mjs` Vercel 토큰을 `--token` 인자로(프로세스 목록 노출) → 환경변수 | `scripts/setup-staging.mjs:135` |
| L15 | `setup-staging.mjs`가 0007·시드를 `database/query`로 실행 — `set local search_path`는 트랜잭션 밖이면 무효(클라우드 pgcrypto는 `extensions`). 개발자는 CLI로 적용해 문제 없었음; 스크립트 첫 실행 때 확인 | `scripts/setup-staging.mjs`, 0007 |

### PRD 커버리지 공백 (⚠️만)
| # | 항목 | 규모 |
|---|---|---|
| G1 | **B-01 브랜드 홈** — 2단계 골격 그대로(새 제안 수·열린 항목 수). "지금 당신 차례" 핸드오프 카드 모음·청구 예정·타임라인 없음. 데이터 함수는 전부 있음(`lib/handoff.ts`, `orderInvoice`, `transitionEvents`) | M |
| G2 | A-05 샘플 라이브러리 화면(위치 컬럼만 있음) | S |
| G3 | A-08 검품 템플릿 관리 UI — `inspection_templates` 테이블 미사용(검품 기준은 상품 필드에서 생성). UI를 만들거나 테이블 제거 | S |
| G4 | 샘플 검품이 OK/불량/없음+실측만 — D14 "필드 1:1"은 본품만 적용 | M |
| G5 | P-01 채널톡 위젯(키 수령 후) | S |
| G6 | OTP 실패 5회 제한(D10) — GoTrue 설정 또는 서버 카운트 | S |
| G7 | C-02 오프라인 큐 자동 테스트 없음 | S |
| G8 | B-04 100제안 LCP 측정(스테이징) | S |

### 테스트 공백(돈에 가까운 순)
`confirmOrder` 전체 흐름(선점 부분 실패·크레딧 RPC 실패·재시도) DB 통합 테스트 · 재승인 뒤 진행 중 발주 금액(B-1 경로) · `requestDeposit` partial_confirmed 선금 · `orderInvoice` 옵션+미회수+선금 동시 분기.

## 5. 결론

기능 범위(PRD §8 MVP 26화면)는 전부 구현되어 있고, 돈·권한의 핵심 안전장치는 DB 권한 수준에서 39개 자동 체크로 묶여 있다. 이번 전수 검증에서 나온 MED 6건은 전부 "코드는 막았지만 DB 직접 접근 또는 동시 실행이면 뚫리는" 유형이었고 0053으로 닫았다. 남은 것은 운영 환경에서만 확인 가능한 것(E2E 2건·레이트 리밋·크론 시간)과 화면 보강(B-01 홈) — 개발자 인수 범위로 `docs/DEVELOPER_HANDOVER.md` §4에 연결했다.
