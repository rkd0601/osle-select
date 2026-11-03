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

## 안 한 것
- 운영 세팅 스크립트 — 스테이징 한 번 돈 뒤(시드 없이·PITR·도메인).
- 디자인 라운드(13-3), 남은 muted 85곳 — Figma 입력 필요.

## 질문 (보수적 기본값으로 진행)
1. ko "원가 구간" → 원청 계정에선 "공급 단가 구간"으로 같이 바꿨다. 기본값: 바꾼 채로.
2. 스테이징을 "별도 Vercel 프로젝트의 production"으로 둔 것(Preview + e2e.yml 흐름 대신). GitHub 원격이 생기면 e2e.yml 흐름으로 옮길지. 기본값: 지금 방식 유지, 원격 생기면 Preview 환경변수만 추가.

게이트: vitest 213 · tsc · eslint · build · SQL 38/38 + 사전 점검. `/login` First Load **209kB → 140kB**, `/invite/[token]` 139kB. 다음 마이그레이션 번호 **0053**(이번 단계 마이그레이션 없음).
