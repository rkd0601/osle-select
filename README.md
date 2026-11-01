# OSLE Select (가칭)

브랜드가 원하는 상품을 위아더가 중국 현장에서 직접 보고 찾아 매칭하고, 자체 검수로 품질을 보증하는 B2B 플랫폼.
요구사항: `docs/PRD.md` · 규칙: `CLAUDE.md` · 기획서: https://claude.ai/artifact/ExcPxzhWJMRCGKDo8M7YkN · Figma: https://www.figma.com/design/mxlnMkP7o8kIpt4dBZL6gh

## 시작하기
`docs/GETTING_STARTED.md` 를 따른다 (Supabase 연결 → 첫 관리자 → Claude Code 3단계 프롬프트).

## 1·2단계 포함 내용
- Next.js 15 + TypeScript + Tailwind 골격, 디렉터리(CLAUDE.md 기준)
- `supabase/migrations/0001~0006`: enum, 테이블, RLS, 브랜드·CN 뷰, 권한 revoke, 함수·트리거
- `supabase/seed.sql`: ADMIN 1, CN 1, 원청 2, 브랜드 2(+owner/member), 요청 1(항목 2), 상품 3, 제안 1
- `lib/config.ts`, `lib/pricing.ts`, `lib/transitions.ts`, `lib/sla.ts` + Vitest 22건
- `tests/sql/`: Docker 없이 로컬 Postgres로 마이그레이션·RLS·원가 격리를 검증하는 스크립트
- 2단계: 인증 3종(`/login` 이메일 OTP·카카오·직원 비밀번호), `/auth/callback`·`/auth/signout`·`/home`, 역할 가드(`middleware.ts`), 브랜드 멤버십 404 가드(`app/b/[slug]/layout.tsx`), 초대 수락(`/invite/[token]`, 마이그레이션 0007), 브랜드·CN·관리자 셸, 디자인 토큰·폰트 규칙(`app/globals.css`)

## 3단계 포함 내용 (요청: B-02·B-03·A-02·C-01)
- 마이그레이션 `0008`(상태 테이블 직접 쓰기 revoke, 요청 중국어 원문 컬럼 select 차단), `0009`(`v_requests_brand`·`v_request_items_brand`, CN 뷰에 요청 메모)
- `lib/requests.ts`(집계·입력 검증·이미지 경로), `lib/db/transition.ts`(전이 한 곳 + 감사 로그), `lib/notify.ts`(인앱만), `lib/translate`(Claude API, 용어 사전 주입), `lib/storage.ts`(서명 URL)
- B-02 요청(항목 여러 개, 사진 리사이즈 → 서명 URL 업로드 → 프록시 폴백), B-03 목록·상세(핸드오프 카드·타임라인·보완 응답·취소)
- A-02 큐(기한 순)·상세(항목 정리·번역 초안·보완 요청·배정/재배정·보류·병합·분리·이미지 이동)·대행 입력
- C-01 목록·상세(zh-CN, 목표 진가 CNY는 CN_SOURCER만, 开始寻找, 向品牌提问 → 4시간 게이트 행 생성)
- `components/domain/`: 상태 pill, 핸드오프 카드, 타임라인, 원문/번역 병기, 요청 양식, 이미지 선택
- ESLint 룰 + grep 테스트: 브랜드 코드의 원가·원청 테이블 직접 조회 차단

## 실행
```
pnpm i
pnpm test                 # 단위 테스트
pnpm db:check:lite        # PGlite(WASM)로 마이그레이션+시드+검증 — Docker·로컬 PG 불필요, Windows OK
pnpm db:check             # 로컬 PG16으로 같은 검증 (root가 아닌 사용자로 실행)
pnpm supabase start && pnpm supabase db reset   # Supabase CLI(Docker) 환경
pnpm dev
```

## 검증 결과 (2026-11-01)
```
PASS 1: brand cannot read product_costs/vendors/settings/glossary; products table yields 0 rows
PASS 2: brand views expose no cost/vendor/fx/hidden_margin/weight/_zh columns
PASS 3: brand isolation (A sees own 1 offer/1 product/6 variants, B sees 0)
PASS 4: brand sees product_price_krw 17,570 and fee_rate 0.20 (supply 21,090)
PASS 5: member blocked from purchase insert, owner allowed
PASS 6: CN sees only assigned items; VENDOR masked brand label and target price
PASS 7: offer issue trigger → code OS-26FW-0001 / offering / item offered
PASS 8: product recheck cascades to offers
```

## 설계 메모 (1단계에서 정한 것)
- 원가·원청·설정·용어 사전은 `authenticated` 롤에서 테이블 권한 자체를 revoke. 앱은 서비스 롤(서버 액션)로만 접근하고 역할을 서버에서 검증한다. CN의 원가 입력도 서버 액션 경유.
- 브랜드 뷰 `v_products_brand` 등은 `security_invoker=false`(definer)로 두고, where 절에서 "내 브랜드에 제안이 걸린 상품"만 노출. 컬럼은 명시 열거.
- 제안 insert 트리거가 상품 코드(OS-26FW-0001) 발급·`offering` 전이·요청 항목 `offered` 전이를 처리한다. 재확인(recheck)은 걸린 제안 전부로 캐스케이드.
- 상태 전이·SLA는 DB가 아니라 `lib/transitions.ts`·`lib/sla.ts`에서 강제(서버 액션). DB 트리거는 파생 상태 동기화만.
