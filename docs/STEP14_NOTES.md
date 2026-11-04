# 14단계 노트 — Jay 손이 가는 일 최소화 (저장소 안에서 되는 것 전부)

Claude Code(개발) → Cowork(기획·검증). 기준: Jay 지시 2026-11-02 "내가 직접 해야 하는 부분들을 최소화하고, 모두 개발 진행해줘" — CLAUDE_CODE_NEXT r10 "대기"보다 우선. DECISIONS 11-3·13-1.

## 한 것 (2026-11-02)

### 0. r10 수용
- 커밋 b880368(0052 RPC + SQL 38) · b169cb6(slug 승인 RPC 호출·대비 검사·문서) · 4a058d2(HANDOFF §8 CI 설명을 실제 `.github/workflows`와 대조 — 두 파일 모두 커밋돼 있음).

### 1. 원청 계정 가격 라벨 (DECISIONS 13-1) — 활성화 때 코드 변경 0
- 결정은 "CN_VENDOR 활성화 때 교체"였지만, 사전을 **역할별로 덮어쓰는 방식**으로 지금 넣었다: `lib/i18n/{ko,zh-CN}.cn-vendor.json` + `lib/i18n/cn.ts#tFor(vendor)`. 소싱 담당 문구는 그대로("원가 ¥"/"成本价档"), 원청 계정만 "공급 단가 ¥"·"공급 단가 구간" / "单价 ¥"·"报价档".
- 쓰는 곳: C-02 간단 등록(`vendorLocked`), C-03 공급 블록·공개 조건 체크리스트(`vendor` prop), 상품 목록 재확인 사유.
- ko `product.field.costTiers`·`product.check.cost`("원가 구간")도 같은 이유로 "공급 단가 구간"으로 맞췄다(13-1은 ko "원가 ¥"만 명시) — 질문 1.
- 테스트: 덮어쓰기 키가 cn 사전에 실제로 있는지, 원청 라벨에 `원가|成本`이 없는지, ko/zh 키가 일치하는지.

### 2. 로그인·초대 수락을 서버 액션으로 (DECISIONS 11-3)
- `app/(public)/login/actions.ts`: `sendLoginOtp`·`verifyLoginOtp`·`staffLogin`·`kakaoLoginUrl`(PKCE verifier는 서버 쿠키, `skipBrowserRedirect`)·`currentEmail`·`refreshMySession`. zod 검증, 실패 사유는 하나(`login.error.generic`, 계정 존재 여부 비노출), `next`는 서버가 `safeNext`로 다시 거른다.
- `login-form.tsx`·`invite-form.tsx`는 `lib/supabase/browser`를 더 이상 import하지 않는다 → 저장소에 브라우저 Supabase 클라이언트 사용처 0. `/login` First Load 209kB → **140kB**.
- 11-3은 "E2E가 도는 환경에서"였다. 스테이징 첫 E2E(`login`·`invite` 스펙)가 이 변경의 첫 실검증 — 실패하면 이 커밋만 되돌리면 된다.

### 3. 스테이징 자동 세팅 (`scripts/setup-staging.mjs` · `docs/SETUP_STAGING.md`)
- Jay 손: 토큰 2개(Supabase·Vercel)를 `.env.staging`에 붙여넣기. 나머지 키는 선택.
- 스크립트(Node 22 fetch, CLI 설치 불필요 — 배포만 `npx vercel`):
  Supabase 프로젝트 생성(서울) → 0001~0052 적용(`supabase_migrations.schema_migrations`에 기록 → 나중에 CLI `db push`와 호환) → 시드 + **시드 계정 비밀번호 무작위화**(`E2E_PASSWORD`) → API 키 → 버킷 6개 비공개 50MiB → Vercel 프로젝트·환경변수(production+preview) → Auth 설정(가입 끔·OTP 6자리 10분·카카오는 키 있을 때만·Site URL/Redirect) → 배포 → 도메인 확정 뒤 필요하면 재배포 → `/api/health`(Bearer) → 사전 점검.
- 스테이징은 **별도 Vercel 프로젝트의 production**으로 배포한다 — 주소가 고정되고(`NEXT_PUBLIC_APP_URL`을 빌드 전에 알 수 있음) GitHub 원격이 없어도 된다(이 저장소는 아직 remote 없음). 그래서 `e2e.yml`(deployment_status) 대신 `--e2e`로 로컬 Playwright를 스테이징 주소에 돌린다.
- 안전: `.vercelignore`가 `.env*`를 업로드에서 뺀다. `.env.staging`은 `.gitignore`. 운영에는 쓰지 않는다(시드를 넣으므로).
- **실계정 미실행.** Management API 필드 이름(`config/auth`의 `disable_signup`·`mailer_otp_*`·`external_kakao_*`, `api-keys?reveal=true`)은 문서 기준이고 문법 검사만 했다. 첫 실행 오류는 메시지대로 고친다.

### 4. 개발자 로컬 세팅 활용 (2026-11-03)
- 개발자가 GitHub(`rkd0601/osle-select`, `feat/B-02-request` = c7c79ed: r10 + `.gitignore` 비밀 파일 패턴)에 올리고 클라우드 Supabase 개발 프로젝트를 만들었다(0001~0052 + 시드 적용 확인, 비밀번호는 `.env.local`의 `LOCAL_DEV_PASSWORD`). 받은 zip에서 `.git`·`.env.local`만 가져왔다.
- 우리 쪽 r10 커밋 2개(b880368·b169cb6)는 c7c79ed와 내용이 같아 버리고, 그 뒤 커밋을 c7c79ed 위로 rebase → GitHub 브랜치에서 fast-forward로 이어진다. **push는 안 했다**(원격 등록은 Jay 확인 뒤).
- 개발자가 클라우드 적용 중 고친 것 커밋(854e27f 계열): 0007 `set local search_path = public, extensions`(클라우드 pgcrypto 위치), seed `created_at`·`updated_at`·`last_sign_in_at`(GoTrue). PGlite auth shim에 `last_sign_in_at` 추가.
- **첫 E2E 실행**(로컬 `next dev` + 클라우드 DB, `E2E_LOCAL=1`): 9개 중 **7 통과 · 2 skip**. 로그인 서버 액션(11-3)이 실제 Supabase에서 동작 확인. 보정: 로그인 버튼 셀렉터 `exact`("← 로그인"과 겹침), 로컬은 `workers: 1`(dev 서버 첫 컴파일로 병렬 시 30초 초과 거짓 실패).
  - skip 1 `CN masking`: 원청 계정 시드가 없었다 → seed에 `vendor@zhongzhou.example`(CN_VENDOR, 中洲 3F-312 `owner_profile_id`) 추가. 클라우드 DB에는 아직 없음 — 넣은 뒤 `E2E_CN_VENDOR_EMAIL=vendor@zhongzhou.example`.
  - skip 2 `B-12 패키지`: 시드에 발주 확정·샘플 채택 상품이 없다 — 시드 확장 필요.
- 줄바꿈: 이전 커밋들에서 Windows 편집 스크립트가 13개 파일을 CRLF로 바꿨다 → LF 복원 + `.gitattributes`(`eol=lf`).

### 5. 전체 검증 (2026-11-04)
- 로컬 게이트: vitest 213 · tsc · eslint · build · SQL 38/38 + 사전 점검 — 전부 통과.
- E2E(로컬 dev + 클라우드 DB): 7 통과 · 2 skip(원청 계정·패키지 시드 없음). 첫 로그인 뒤 `/home` 첫 컴파일이 5초를 넘겨 거짓 실패 → 로그인 헬퍼 대기 20초.
- 클라우드 DB 권한 실측(anon·브랜드 A/B·CN 세션): `product_costs`·`vendors`·`vendor_channels`·`settings`·`audit_logs`·`offers`·`brand_applications` 모두 42501, 브랜드는 `v_*_brand` 뷰로 자기 브랜드 행만, 뷰 컬럼에 원가·원청·마진·`*_zh` 없음, 다른 브랜드 `requests`·`request_items`·`brands` 접근 불가.
- 정적 점검: 브랜드 코드의 원가 테이블 직접 조회 0, 서비스 롤 키는 `lib/supabase/admin.ts`만, `NEXT_PUBLIC_` 비밀 0, `/cn` 외부 URL·CDN 0, PG·세금계산서 코드 0, 서버 액션 26개 파일 전부 역할 검사(공개 로그인·신청 제외 — 헬퍼 `step`·`owner`·`saveAxis` 경유 포함).
- GitHub CI(`ci.yml`) 34c8a3d 성공.

### 6. Cowork 전체 검증 수용 + 화면 테스트 준비 (2026-11-04)
- Cowork `VERIFICATION_2026-11-04.md` 수용: 커밋 b27e165(0053 + SQL 39) · b8fa84f(코드·문서). **Cowork 사본이 되돌린 `cancelOrder` "입금 신고 뒤 브랜드 취소 금지"(리뷰 LOW-7, 011d5c3)는 복원**. zip은 저장소 밖(`C:\Users\one\dev\`)으로 옮김. 게이트: vitest 215 · tsc · eslint · build · SQL 39/39.
- **0053은 클라우드 개발 DB에 미적용** — 이 PC에 DB 접속 수단(Supabase CLI·DB 비밀번호·액세스 토큰)이 없다. 적용 전까지 A-06 불량 크레딧 발행만 실패(`issue_order_credit` 없음), 나머지는 코드만 바뀐 것. 개발자가 `supabase db push`.
- 클라우드 DB에 시드 원청 계정 추가(서비스 롤 admin API — seed.sql 31번 행과 같은 id·역할·프로필·`owner_profile_id`, 비밀번호는 `LOCAL_DEV_PASSWORD`).
- **개발용 빠른 로그인**(`lib/auth/dev-login.ts`, `app/(public)/login/dev-actions.ts`·`dev-quick-login.tsx`): 로그인 화면 아래 시드 6계정 버튼. `NODE_ENV=development` + `VERCEL` 없음 + `LOCAL_DEV_PASSWORD` 있을 때만 렌더·동작(서버 액션도 같은 검사), 이메일은 시드 목록 enum만. 단위 테스트 5.
- `scripts/start-dev.cmd`(더블클릭 → dev 서버 + 브라우저), `docs/TEST_GUIDE.md`(Jay용 화면 테스트 안내), `.gitattributes` `*.cmd eol=crlf`.
- 화면 점검(dev 서버 + 클라우드 DB, 각 역할로 링크 순회): 브랜드 A 14 · 관리자 26 · `/cn` 8 · 관리자로 브랜드 B 11 화면 — 오류 0. 브랜드 B 세션으로 브랜드 A·미존재 slug·`/admin`·`/cn` 전부 404. 원청 계정 `/cn/products/new` 라벨 "单价"(成本价 없음), 다른 원청 상품 안 보임.
- E2E: **8 통과 · 1 skip**(B-12 패키지 — 발주 확정 시드 없음). CN masking 첫 통과. `e2e.yml`에 `E2E_CN_VENDOR_EMAIL`(검증 L13).

## 안 한 것
- 운영 세팅 스크립트 — 스테이징 한 번 돈 뒤(시드 없이·PITR·도메인).
- 디자인 라운드(13-3), 남은 muted 85곳 — Figma 입력 필요.

## 질문 (보수적 기본값으로 진행)
1. ko "원가 구간" → 원청 계정에선 "공급 단가 구간"으로 같이 바꿨다. 기본값: 바꾼 채로.
2. 스테이징을 "별도 Vercel 프로젝트의 production"으로 둔 것(Preview + e2e.yml 흐름 대신). GitHub 원격이 생기면 e2e.yml 흐름으로 옮길지. 기본값: 지금 방식 유지, 원격 생기면 Preview 환경변수만 추가.

게이트: vitest 213 · tsc · eslint · build · SQL 38/38 + 사전 점검. `/login` First Load **209kB → 140kB**, `/invite/[token]` 139kB. 다음 마이그레이션 번호 **0053**(이번 단계 마이그레이션 없음).
