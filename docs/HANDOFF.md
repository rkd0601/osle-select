# OSLE Select 운영 핸드오프

2026-11-02 기준 저장소 상태(마이그레이션 0001~0052, vitest 212, SQL 체크 38)에서 코드로 확인되는 사실만 적었다. 각 절 끝 괄호가 근거 파일이다. 요구사항 원천은 `docs/PRD.md`, 결정 누적은 `docs/COWORK_DECISIONS.md`.

## 1. 아키텍처 한 장

- Next.js 15 App Router. 화면은 RSC, 모든 변경은 `"use server"` 서버 액션 → zod 검증 → 역할·멤버십 코드 검증(`lib/auth/guards.ts`) → **서비스 롤**(`createAdminClient`, `SUPABASE_SERVICE_ROLE_KEY`)로 Postgres에 쓴다.
- 브랜드·CN 세션(`authenticated`)은 테이블 insert/update/delete 권한이 없다(0005·0008·0012·0026·0034·0039·0044·0045·0047·0051 revoke). 상태 변경은 `applyTransition`(전이표 → SLA → 낙관적 잠금 → `audit_logs`) 한 곳.
- 읽기: 브랜드 코드(`lib/db/brand/*`)는 `v_*_brand` 뷰만(원가·원청·중량·`_zh`·마진·환율 컬럼 없음). CN은 `v_*_cn` 마스킹 뷰(희망 단가·브랜드 id 가림). 테이블 직접 조회는 ESLint + `tests/unit/brand-boundary.test.ts`가 막는다.
- Storage 버킷 6개 전부 비공개, 서명 URL 30분(`SIGNED_URL_TTL`). 전역 업로드 상한 50MiB, 이미지 버킷 5MiB·webp만.
- i18n 사전 4겹: 공통(`ko.json`) ⊂ cn(`ko.cn.json`) ⊂ admin(`ko.admin.json`); 소싱 담당 전용(`cn-sourcer`, `server-only`). 관리자·내부 문구는 브랜드 번들에 실리지 않는다(테스트 고정).

| 디렉터리 | 역할 |
|---|---|
| `app/(public)` `app/b/[slug]` `app/cn` `app/admin` `app/api/{cron,health}` | 공개 · 브랜드 · 중국 소싱 · 관리자 · 배치/헬스 |
| `lib/transitions.ts` `lib/sla.ts` `lib/db/transition.ts` | 상태 전이표 · 담당/기한 · 전이 적용 |
| `lib/pricing.ts` `lib/orders.ts` | 가격·청구 순수 함수(테스트 필수) |
| `lib/notify*.ts` `lib/digest.ts` `lib/channels/*` | 알림 생성·라우팅·발송 |
| `lib/exports/*` | 표준 상품 패키지(B-12) |
| `supabase/migrations` `supabase/checks` `tests/sql` | 스키마·RLS·권한 / 운영 사전 점검 / 로컬 PG 체크 |

(`CLAUDE.md`, `lib/supabase/admin.ts`, `lib/db/transition.ts`, `supabase/config.toml`, `lib/config.ts`, `lib/i18n/*.ts`)

## 2. 역할·권한

역할은 JWT `app_metadata.role`(`profiles`에 role 컬럼 없음). 경로 접근은 `routeAccess()`, 브랜드 slug↔멤버십은 `app/b/[slug]/layout.tsx`가 DB로 검증(불일치·미존재 모두 404).

| 역할 | 들어가는 라우트 | 읽기 | 쓰기 | 특이사항 |
|---|---|---|---|---|
| ADMIN | `/admin`, `/cn`, `/b/*`(대행) | 서비스 롤 경유 전부 | 모든 서버 액션 | 대행 행위는 `audit_logs.on_behalf_of_brand_id` |
| BRAND_OWNER | `/b/{slug}` | `v_*_brand` 뷰 | 요청·샘플·발주·설정(B-10) | 멤버 초대·권한·제거·기본 배송지·slug 변경 요청은 owner만 |
| BRAND_MEMBER | `/b/{slug}` | 위와 같음 | `can_purchase`일 때만 구매 전이(발주 확정·수량 확정·취소) | `assertTransition(..., {role, canPurchase})` |
| CN_SOURCER | `/cn` | `v_*_cn` + 소싱 전용 사전(목표가) | 항목 소싱 시작·상품 등록·질문·재고/출고 보고 | 그룹 WeCom 봇 |
| CN_VENDOR | `/cn` | 자기 원청 상품만, 목표가 계산 자체 생략 | 상품 등록·재고/출고 보고 | 알림은 `vendor_channels`의 자기 웹훅으로만(없으면 인앱만) |

공개 경로: `/`, `/login`, `/invite`, `/auth`, `/apply`, `/api/cron`(Bearer 자체 인증), `/api/health`.
(`lib/auth/access.ts`, `lib/config.ts`, `app/b/[slug]/layout.tsx`, `app/b/[slug]/settings/actions.ts`, `app/cn/items/[id]/page.tsx`, `lib/i18n/cn-sourcer.ts`, `lib/notify-rules.ts#wecomUrlFor`)

## 3. 돈 흐름

가격 공식(`lib/pricing.ts`): 상품가 = 원가 × 환율 × (1 + 숨은 마진) → 10원 올림; 공급가 = 상품가 × (1 + 수수료). 발행 시 `offers` 1행에 tier·수수료·환율·옵션 단가를 고정(규칙 3). 선금 = (소계 + 수수료) × 선금율.

발주 체인(전이표, `lib/transitions.ts` `order`):
`reserved → stock_checking → {stock_confirmed | partial_confirmed | stock_short} → deposit_pending → hold_confirmed → quoting → quoted → qty_confirmed → final_quoted → confirmed → cn_shipped → (kr_inspecting) → sent_to_brand → delivered → report_done`. 취소는 ADMIN은 confirmed 전 어디서나, 브랜드는 입금 확인 전까지. confirmed 이후 수량 되돌림 간선 없음.

청구(`lib/orders.ts#orderInvoice`): 제안별 tier(총수량) → 소계 + 수수료 + 옵션 − 미회수 샘플 차감(1회) − 선금 − 크레딧 + 물류 + 샘플 특송. `total_krw = max(0, raw)`, 초과분은 `refund_due_krw`(환불은 플랫폼 밖, 규칙 13). 라인 단가 `unit_effective_krw`로 불량 크레딧이 청구액을 넘지 않게.

크레딧: `credit_brand`(적립) · `use_brand_credit`(차감, 행 잠금) · `use_brand_credit_for_order`(발주당 1회, `orders.credit_used_krw` null일 때만) — 서비스 롤 전용 RPC.

| 액션 | 감사 로그 action |
|---|---|
| 발주 담기 / 확정 / 확정 실패 | `order.reserve` / `order.confirm` / `order.confirm_error` |
| 선금 요청 / 입금 신고 / 입금 확인 | `order.deposit_request` / `order.deposit_report` / `payment.confirm` |
| 범위 견적 / 최종 견적 / 청구 재생성 | `order.quote_range` / `order.quote_final` / `order.invoice_rebuild` |
| 크레딧 발급 / 불일치 / 미송 선택 / 샘플 게이트 면제 | `order.credit` / `order.credit_mismatch` / `order.backorder_choice` / `order.waive_sample_gate` |
| 샘플 청구 / 샘플 크레딧 | `sample.charge` / `sample.credit` |
| 원가 수정 / 재산정 / 제안 발행 | `price.cost_update` / `price.reprice` / `offer.issue` |
| 설정 변경(환율 / 그 밖) | `settings.fx_update` / `settings.update` |
| 브랜드 조건·크레딧 조정 | `brand.terms_update` / `brand.credit_adjust` |

감사 로그 화면 "돈 탭" = `price.*`, `payment.*`, `settings.*` + 위 발주·샘플·브랜드 액션(`lib/audit.ts` MONEY_ACTIONS).
(`lib/pricing.ts`, `lib/orders.ts`, `lib/transitions.ts`, `supabase/migrations/0035·0041`, `lib/audit.ts`, `app/admin/orders/actions.ts`)

## 4. 설정(A-08)

숫자 키 26개는 `lib/settings-schema.ts` 한 곳(그룹·단위·범위), 기본값은 `DEFAULT_SETTINGS`. DB `settings`가 우선. 비율은 화면 %, 저장은 소수 4자리.

| 그룹 | 키(단위, 범위, 기본값) |
|---|---|
| money | `fx_rate_cny_krw`(원, 100~400, 200) · `hidden_margin_rate`(0~0.5, 0.2) · `fee_rate`(0~0.5, 0.2) · `fx_recheck_pct`(0.005~0.2, 0.03) |
| logistics | `sample_air_per_kg_krw`(15,000) · `domestic_shipping_krw`(4,000) · `logistics_estimate_per_kg_krw`(5,000) · `customs_estimate_rate`(0.23) |
| periods | `exclusive_days` 14 · `offer_valid_days` 30 · `sample_feedback_days` 14 · `sample_return_days` 14 · `report_days` 7 · `cn_question_gate_hours` 4 · `review_sla_days` 2 · `intake_sla_days` 1 · `stock_check_days` 2 · `deposit_days` 3 · `quote_sla_days` 2 · `reconsent_days` 3 · `cn_ship_days` 3 · `logistics_days` 10 · `min_lead_days` 14 |
| etc | `sample_qty_max` 3 · `quote_margin_pct` 0.15 · `target_diff_pct` 0.15 |

목록 키: `categories`, `rejection_templates`(code·ko·zh), `bank_account`(bank·number·holder, null = 삭제).
쓰기는 RPC `update_setting(key, value, actor, action)` 하나(0048): upsert(또는 null이면 삭제) + 감사 로그를 한 트랜잭션, 이력은 `settings_history` 트리거(insert/update/delete). 환율 저장 시 `fxJob()`을 즉시 돌려 결과(처리 상품 수·검사 제안 수·상한 도달)를 화면에 보여 준다. 발행된 제안은 발행 시점 값 고정(규칙 3).
(`lib/settings-schema.ts`, `lib/settings-lists.ts`, `lib/config.ts`, `supabase/migrations/0048`, `app/admin/settings/actions.ts`)

## 5. 크론 7개

진입점 `GET /api/cron/{job}`, `Authorization: Bearer ${CRON_SECRET}`(상수 시간 비교). **Vercel Pro 필요**(Hobby는 하루 1회라 `*/5`·`*/15`·`*/30`이 안 돈다). 스케줄은 UTC.

| job | 스케줄 | 하는 일 | 안 돌면 |
|---|---|---|---|
| `deliver` | `*/5 * * * *` | instant 알림 미발송분 이메일·WeCom 발송(선점 후 발송, 3회 재시도) | 즉시 알림이 인앱에만 남음 |
| `digest` | `0 0,1 * * *` | 수신자별 하루 1통(00 UTC = 09:00 KST 브랜드·ADMIN, 01 UTC = 09:00 CST CN) | 다이제스트 메일 없음 |
| `sla` | `*/30 * * * *` | 기한 지난 항목·상품·제안·샘플·발주 → 담당에게 1회 알림(`sla_alerts`) | 지연 알림 없음 |
| `offers` | `10 15 * * *` | 유효기간 지난 제안 → `expired` + 브랜드 digest | 만료 제안이 살아 보임 |
| `fx` | `20 15 * * *` | 발행 환율 대비 ±`fx_recheck_pct` 넘은 상품 → `recheck`(한 번에 제안 2,000건) | 환율 변동 재확인 누락 |
| `samples` | `30 15 * * *` | 샘플 피드백·회수 기한 초과 → 관리자 1회 알림 | 샘플 지연 알림 없음 |
| `cn_gate` | `*/15 * * * *` | CN 질문 4시간 게이트 지나면 브랜드에 자동 노출 | 질문이 브랜드에 안 보임 |

수동 실행: `curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/sla` → `{job, result}`. 모든 상태 변경은 `applyTransition`(actorId null = 시스템, 감사 로그 남음).
(`vercel.json`, `app/api/cron/[job]/route.ts`, `lib/auth/bearer.ts`, `lib/cron-jobs.ts`, `lib/notify-delivery.ts`, `lib/notify-rules.ts#digestDue`)

## 6. 알림

- 단일 진입 `notify(event)`: 이벤트 → 수신자(ADMIN 목록은 Auth Admin API 요청 단위 캐시 / 브랜드 멤버 / CN 담당) → `notifications` 행(인앱). `EVENT_AUDIENCE`가 이벤트 전수를 커버해야 컴파일된다.
- 등급: `INSTANT` 집합(공이 넘어오는 순간·대화·주소 변경·SLA 초과 등)은 응답 뒤 `after()`로 즉시 + 5분 배치 재시도, 나머지는 digest.
- 채널: CN 역할 = WeCom, 브랜드·ADMIN = 이메일(Resend), 인앱은 공통. CN_VENDOR는 `vendor_channels`의 자기 웹훅만 — 없으면 외부 발송 생략(`no_webhook`, attempts 끝), 그룹 봇 대체 없음.
- 코멘트 묶기: 같은 수신자·같은 대상에서 마지막 **실제 발송(또는 발송 예정)** 행이 10분 안이면 외부 발송 생략(`shouldBundle`).
- 정지 브랜드(`brands.status <> 'active'`) 멤버는 SLA·digest에서 제외. 3회 실패(건너뜀 아님) → `notify.delivery_failed`로 ADMIN 인앱.
(`lib/notify.ts`, `lib/notify-rules.ts`, `lib/notify-delivery.ts`, `lib/digest.ts`, `lib/channels/{email,wecom}.ts`, `supabase/migrations/0050·0051`)

## 7. 수출 패키지(B-12)

위아더 표준 패키지 zip: `README.txt`(사용법 + 쇼핑몰별 컬럼 대응표) · `products.csv`(20컬럼 고정, 판매가 빈칸, 공급가 없음) · `options.csv`(SKU 제안) · `sizes.csv`(실측 12열) · `detail/{code}.html` · `images/{code}_{nn}.jpg`(`source='own'` + 판매 사용 허용만, sharp JPG). 쇼핑몰 4곳 매핑은 `presets/`에 "참고용(초안)".
- 데이터는 브랜드 뷰 + 발주 확정 시 저장한 `export_snapshots`(0043, 브랜드 읽기만). 생성 직후 금지 키·한자 스캔 → 걸리면 중단 + `export.leak_blocked` 감사.
- 상한: 사진 120장, zip 48MiB(`export.error.tooLarge`), 라우트 `maxDuration=60`. CSV는 수식 주입 방지(`= + - @ 탭` 접두 `'`).
(`docs/EXPORT_PACKAGE_SPEC.md`, `lib/exports/*`, `app/b/[slug]/exports/actions.ts`, `supabase/migrations/0043·0044`)

## 8. 배포·롤백

절차는 `docs/DEPLOY_CHECKLIST.md`(A Supabase → B Vercel → C E2E → D 운영 첫날)와 `docs/GETTING_STARTED.md`.
- 마이그레이션 `0001`~`0052`(0018·0019 없음), `pnpm supabase db push`로 순서대로. 각 파일 끝 `-- down` 주석이 되돌리기 메모. RLS·권한 변경은 별도 파일/커밋.
- 운영 DB에 `supabase/seed.sql` 금지(시드 계정 `password123`). 배포 전 SQL Editor에서 `supabase/checks/prod_preflight.sql` → `PREFLIGHT OK`(시드 흔적·`test_login`·서비스 함수 실행 권한·원가/설정 테이블 세션 권한·anon 신청 insert·RLS 꺼진 테이블·환율/계좌·공개 버킷).
- 로컬 게이트: `pnpm vitest run` · `pnpm tsc --noEmit` · `pnpm eslint .` · `pnpm build` · `tests/sql/run_local_check.sh`(PG 바이너리, 체크 38) 또는 PGlite(`tests/sql/run_pglite.mjs`).
- CI 파일 `.github/workflows/ci.yml`(테스트·tsc·lint·빌드·PGlite SQL+사전 점검)·`e2e.yml`(Vercel Preview `deployment_status` 성공 → Playwright) — 둘 다 저장소에 커밋됨(2026-11-02 개발 확인). `ci.yml`은 push·PR마다 `pnpm test`·`tsc`·`lint`·`build`·`db:check:lite`, `e2e.yml`은 Production이 아닌 배포 성공 시 그 URL로 `pnpm e2e`(chromium).
- 롤백: Vercel 이전 배포로 되돌리기 + 해당 마이그레이션 `-- down` 수동 실행(자동 down 없음).
(`docs/DEPLOY_CHECKLIST.md`, `docs/GETTING_STARTED.md`, `supabase/migrations/*`, `supabase/checks/prod_preflight.sql`, `docs/STEP12_NOTES.md`)

## 9. 장애 대응 순서

1. `GET /api/health` — 공개 응답 `{ok, db}`(200/503). `db`는 서비스 롤로 `settings` 1행 head 조회, 공개 호출은 인스턴스별 60초 캐시. `-H "Authorization: Bearer $CRON_SECRET"`이면 `issues`(환경변수 이름·문제 종류, 값 없음)까지.
2. `issues`에 `error`가 있으면 환경변수부터: 필수 5개 누락, 운영(`VERCEL_ENV=production`)에서 localhost/http 주소, `CRON_SECRET` 32자 미만, `NEXT_PUBLIC_*`에 SERVICE_ROLE/SECRET. 서버 시작 로그 `[env] …`(`instrumentation.ts`)도 같은 내용.
3. `db:false` → Supabase 상태·서비스 롤 키·프로젝트 일시정지 여부.
4. 이미지/패키지 실패 → Storage 버킷·전역 상한 50MiB·서명 URL.
5. 알림만 안 옴 → `notifications.delivery_error`(no_channel·no_webhook·bundled·외부 오류), Resend 키/`MAIL_FROM` 짝, WeCom 웹훅, Vercel 크론 실행 로그. 번역 실패는 `ANTHROPIC_API_KEY`/`TRANSLATE_MODEL`.
(`app/api/health/route.ts`, `lib/env.ts`, `instrumentation.ts`, `lib/notify-delivery.ts`)

## 10. 비밀값(이름만)

| 이름 | 쓰임 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저·서버 Supabase 클라이언트 | 필수, 운영 https |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts`만 | 필수, `NEXT_PUBLIC_` 금지 |
| `NEXT_PUBLIC_APP_URL` | 링크·메일 URL(`SERVICE.domain`) | 필수 |
| `CRON_SECRET` | `/api/cron/*`, `/api/health` 상세 | 필수, 32자 이상 |
| `RESEND_API_KEY` + `MAIL_FROM` | 이메일 발송 | 짝으로 |
| `ANTHROPIC_API_KEY` (`TRANSLATE_MODEL`) | 번역 | 없으면 번역 꺼짐 |
| `WECOM_WEBHOOK_URL` | 소싱 담당 그룹 봇 | 원청별 웹훅은 DB `vendor_channels` |
| `KAKAO_CLIENT_ID` + `KAKAO_CLIENT_SECRET` | Kakao OAuth | 짝으로 |

(`.env.example`, `lib/env.ts`, `lib/config.ts`)

## 11. 데이터 보존·개인정보

| 저장 위치 | 내용 | 접근 |
|---|---|---|
| `brands.default_address` (jsonb) | 브랜드 기본 배송지(name·phone·address·memo) | 브랜드 멤버 읽기, owner 수정; 감사 로그 `brand.address_update`는 내용 없이 기록 |
| `sample_requests.ship_to` (jsonb) | 샘플 배송지 | 브랜드 뷰 `v_sample_requests_brand`에 포함 |
| `brand_applications.contact_name/email/phone` | 공개 신청 연락처 | anon 직접 insert 불가(0045), 서버 액션만; ADMIN A-07 |
| `profiles.phone`, `brand_invites.email` | 연락처·초대 이메일 | profiles RLS 본인만, 멤버 이름·이메일은 서비스 롤 디렉터리(`memberDirectory`)로 같은 브랜드 멤버 id만 |
| `audit_logs.diff` | 변경 전후 | 설정·가격은 값 포함(ADMIN 전용 화면), 주소·웹훅 키는 비기록(`{set}`만) |

보존 기간·삭제 절차 코드는 없다(수동). 개인정보 처리방침 문구는 DEPLOY_CHECKLIST D.
(`supabase/migrations/0002·0022·0026·0045`, `app/b/[slug]/settings/actions.ts`, `lib/db/users.ts`, `app/admin/vendors/actions.ts`)

## 12. 아직 안 된 것

- 스테이징 Supabase·Vercel Preview 생성 → `e2e.yml` 첫 실행 → 셀렉터 보정 → 로그인 흐름 서버 액션 전환(번들 209kB, DECISIONS 11-3). 개발 PC·Cowork 모두 Docker가 없어 E2E는 컴파일만 확인됨.
- 디자인 라운드: `docs/DESIGN_TOKENS.md`의 색 13개·타입 17→9단계 매핑을 Figma 스타일 이름과 맞춘 뒤 `:root`만 교체; 대비 미달 2색(muted·warn) 결정; 크기 미상 `text-muted` 85곳.
- CN_VENDOR 활성화 전: 원청 화면 원가 라벨 교체(13-1 "공급 단가/报价档"), 원청별 WeCom 웹훅 입력(A-08), 원청 계정 초대.
- slug 승인 취소 경합은 RPC `approve_slug_change`(0052)와 SQL 체크 38로 막았고, 실제 동시성은 E2E 환경에서 재확인.
(`docs/STEP12_NOTES.md`, `docs/STEP13_NOTES.md`, `docs/DESIGN_TOKENS.md`, `docs/COWORK_DECISIONS.md` r10)
