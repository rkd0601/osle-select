# 개발 시작 가이드 — OSLE Select

1·2단계(셋업, 인증·가드·초대)가 끝난 저장소를 받아 **실제 Supabase에 연결하고 Claude Code로 3단계부터 이어가는** 순서다. 한 번만 따라 하면 된다.

## 0. 지금 저장소에 들어 있는 것

| 영역 | 상태 |
|---|---|
| 스키마·RLS·뷰·권한·함수 (`supabase/migrations/0001~0007`) | 완료, 로컬 PG 검증 8건 PASS |
| 시드 (`supabase/seed.sql`) | ADMIN 1 · CN 1 · 원청 2 · 브랜드 2 · 요청 1(항목 2) · 상품 3 · 제안 1 |
| `lib/config · pricing · transitions · sla · auth/access · auth/session` | 완료, Vitest 22건 |
| 인증 3종 (`/login`: 이메일 OTP · 카카오 · 직원 비밀번호), `/auth/callback`, `/auth/signout`, `/home` | 완료 (P-02) |
| 초대 수락 (`/invite/[token]`, `brand_invites`, `createInvite/acceptInvite`) | 완료 (P-03) |
| 역할 가드 (`middleware.ts` + `app/b/[slug]/layout.tsx` 멤버십 404) | 완료 |
| 브랜드 홈·CN 홈·관리자 대시보드 | 골격만 (데이터 1~2개 표시) |
| 요청·상품·검수·발행·샘플·발주·소통·B-12 | **미착수 — 3단계부터** |

## 1. 로컬 준비 (10분)

```bash
git clone <repo> && cd osle-select
pnpm i
bash scripts/fetch-fonts.sh          # Pretendard · SUIT woff2 → public/fonts
cp .env.example .env.local
pnpm test                            # 22 passed
```

로컬 Postgres가 있으면 Docker 없이도 스키마를 검증할 수 있다(루트가 아닌 사용자로):
```bash
pnpm db:check:lite                   # ALL CHECKS PASSED (PGlite, Docker 불필요)
```

## 2. Supabase 프로젝트 만들기 (15분)

1. https://supabase.com → New project (리전 **Northeast Asia (Seoul)**, 중국 접속 속도 테스트 후 필요하면 Singapore/Tokyo 비교).
2. Project Settings ▸ API 에서 `Project URL`, `anon public`, `service_role` 키를 `.env.local`에 넣는다.
3. Authentication ▸ Providers:
   - Email: **Enable email provider 켜기, "Confirm email" 끄기, Signup 끄기**(초대·승인 기반). OTP 길이 6, 만료 600초(10분). Rate limit은 기본값 유지.
   - Kakao: 켜고 Kakao Developers(위아더 계정)에서 만든 앱의 REST API 키/Client Secret 입력. Redirect URI는 Supabase가 보여주는 `https://<ref>.supabase.co/auth/v1/callback`을 카카오 콘솔에 등록.
4. Authentication ▸ URL Configuration: Site URL `http://localhost:3000`, Redirect URLs에 `http://localhost:3000/**`, 배포 도메인 추가.
5. Storage: 버킷 `product-images`, `request-images`, `sample-photos`, `inspection-photos`, `vendor-cards`, `exports` 를 **모두 Private**으로 생성(정책은 4단계에서 마이그레이션으로 추가). 3단계 요청 이미지는 서버가 서비스 롤로 서명 URL을 발급하므로 `request-images` 버킷만 있으면 동작한다.
6. (선택) `ANTHROPIC_API_KEY`를 넣으면 A-02 "번역 초안"·CN 질문 한국어 번역이 동작한다. 없으면 관리자가 중국어를 직접 입력한다.

## 3. 스키마 올리기

```bash
pnpm dlx supabase@latest login
pnpm dlx supabase link --project-ref <ref>
pnpm dlx supabase db push             # 0001~0007 적용
```
시드는 운영 DB에 넣지 않는다. 대신 SQL Editor에서 설정값만 넣는다(`seed.sql`의 `insert into settings …` 블록 복사, 국내 배송비·운송 단가는 결정값으로 수정).

## 4. 첫 관리자 만들기 (JWT 역할 부여)

역할은 `auth.users.app_metadata.role` 에 산다. Dashboard ▸ Authentication ▸ Users ▸ "Add user"로 이메일+비밀번호 사용자를 만든 뒤 SQL Editor:
```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"ADMIN"}' where email = 'admin@wearethe.co.kr';
insert into profiles (id, display_name, locale) select id, '위아더 관리자', 'ko' from auth.users where email = 'admin@wearethe.co.kr';
```
중국 담당자도 같은 방식으로 `CN_SOURCER`. 브랜드 담당자는 관리자가 `createInvite()`(A-07 화면 완성 전엔 서버 액션 직접 호출 또는 SQL로 `brand_invites` insert)로 초대 링크를 만들고, 담당자가 `/invite/<token>`에서 수락하면 역할·멤버십이 자동으로 들어간다.

`pnpm dev` → `/login` 직원 로그인 → `/admin` 대시보드가 뜨면 연결 완료.

## 5. Claude Code로 이어가기

저장소 루트에서 `claude`를 실행하고 **첫 메시지**:

```
CLAUDE.md, docs/PRD.md, docs/GETTING_STARTED.md를 끝까지 읽어줘. 1·2단계(셋업, 인증·가드·초대)는 끝났고
tests/sql 검증 8건과 Vitest 22건이 통과한 상태야. 코드를 쓰기 전에:
1) 현재 코드(lib/, app/, supabase/)를 훑고 PRD 13장 3단계(요청: B-02, B-03, A-02, C-01)를 구현하기 위해
   내가 결정해야 할 것과 모호한 점을 질문으로 정리해줘.
2) 3단계 작업 계획을 파일 단위로 보여줘: 새 Server Action 시그니처, 추가 전이·SLA 규칙, 필요한 마이그레이션(있다면), 컴포넌트.
   components/domain/의 공통 컴포넌트(상태 pill, 핸드오프 카드, 타임라인, variant 매트릭스, 라인시트 카드,
   금액 내역표, 원문/번역 병기, 입금 안내 카드)가 아직 없으니 이번 단계에 필요한 것부터 함께 계획해줘.
3) 승인하면 구현하고, 끝나면 PRD 12장 수용 기준 중 해당 항목을 어떻게 검증했는지 보여줘. pnpm test·tsc·eslint·build 통과 필수.
PRD에 없는 결정은 선택지와 추천을 주고 물어봐. PG·결제·세금계산서 자동 발행은 만들지 마.
```

이후 단계는 `docs/KICKOFF_PROMPT.md`의 "이후 단계별 프롬프트 패턴"에 화면 ID를 넣어 반복한다. 순서: 3 요청 → 4 상품(C-02·C-03·C-04·원청) → 5 검수·발행(번역·A-03·A-04·B-04·B-05) → 6 샘플 → 7 발주 → 8 소통·알림 → 9 B-12·P-01·A-07 → 10 보안 E2E.

### 작업 리듬 (매 화면)
1. 브랜치 `feat/<화면ID>-<슬러그>` 생성.
2. Claude Code에 화면 ID 프롬프트 → 계획 확인 → 구현.
3. `pnpm test && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm build` 통과.
4. 마이그레이션이 생겼으면 `pnpm db:check:lite`(PGlite) · `pnpm db:check`(로컬 PG) 또는 `supabase db reset`(Docker)로 검증, **RLS·권한 변경은 별도 커밋**.
5. 브랜드 화면이면 브랜드 세션으로 열어 원가·원청·중국어 원문이 어디에도 없는지 눈으로 한 번 확인.
6. PR → 머지 → `supabase db push`(스키마 변경 시) → Vercel 자동 배포.

## 6. 배포 (Vercel)

1. GitHub 저장소 연결 → Framework Next.js 자동 인식.
2. Environment Variables에 `.env.local` 값 전부(서비스 롤 키 포함, **Production만**).
3. Supabase Auth URL Configuration에 배포 도메인 추가. 카카오 콘솔 Redirect URI는 Supabase 콜백 하나면 된다.
4. 크론(`vercel.json` 7개 job): Environment Variables에 `CRON_SECRET`을 넣는다(Vercel이 Bearer로 붙여 호출). **Vercel 크론 `*/5`·`*/15`·`*/30`은 Pro 플랜** — Hobby는 하루 1회까지라 deliver·cn_gate·sla가 돌지 않는다.
5. 중국 접속 테스트: `/cn` 페이지를 현지 폰·노트북에서 여러 시간대에 열어 본다. 느리면 Storage 리전·R2 검토(PRD 11장).
6. **Storage 전역 업로드 상한 50MiB**: Supabase Dashboard ▸ Storage ▸ Settings ▸ Upload file size limit를 50MB로. 로컬은 `supabase/config.toml [storage] file_size_limit = "50MiB"`. 전역 값이 버킷(`exports` 50MiB)보다 작으면 버킷 값이 무시되어 B-12 패키지(zip 48MiB 상한, DECISIONS r8-10) 업로드가 사유 없이 실패한다.

### E2E를 스테이징에서 돌리기 (DECISIONS r8-11)
개발 PC·Cowork 모두 Docker가 없어 로컬 Supabase로는 못 돌린다. 스테이징 Supabase 프로젝트 + Vercel Preview를 쓴다.
1. Supabase에 **스테이징 프로젝트**를 따로 만든다(운영과 분리). `supabase link --project-ref <staging-ref>` → `pnpm supabase db push`(마이그레이션) → SQL Editor에서 `supabase/seed.sql` 실행(시드 계정 비밀번호 `password123` — **스테이징 전용, 운영에는 절대 넣지 않는다**).
2. Vercel ▸ Settings ▸ Environment Variables에서 **Preview** 범위에 스테이징 값(`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`·`NEXT_PUBLIC_APP_URL`=Preview 도메인)을 넣는다. `RESEND_API_KEY`는 비워 두면 초대 링크가 화면에 나와 A-07 E2E가 링크까지 검증한다.
3. Preview 배포 URL이 나오면:
   ```
   E2E_BASE_URL=https://<preview>.vercel.app pnpm e2e
   ```
   Vercel Deployment Protection이 켜져 있으면 Protection Bypass 토큰을 `E2E_BASE_URL` 대신 헤더로 넣거나 Preview 보호를 끈다.
4. CI로 돌릴 때는 GitHub Actions에서 Vercel `deployment_status` 이벤트(Preview 성공)를 받아 같은 명령을 실행한다. 스테이징 DB는 E2E가 신청·브랜드를 만들므로 주기적으로 `db reset` + 시드.
5. Docker가 있는 곳이면 `pnpm supabase start && pnpm supabase db reset && pnpm e2e:local`.

## 7. 지금 당장 결정해 두면 좋은 것 (PRD 14장)
- 국내 샘플 배송비, 운송·통관 추정 단가(kg당·관부가세율) 초기값 → `settings`
- Kakao Developers · WeCom · Resend 계정 주체(위아더 법인 계정 권장)
- 쇼핑몰 개발자 계정 신청(카페24 → 고도몰 → 아임웹 → 스마트스토어), 2차 1순위 연동 대비
- 서비스명·도메인 확정 → `lib/config.ts` 한 곳 교체

## 8. 절대 잊지 말 것 (CLAUDE.md 요약)
- 브랜드 코드(`lib/db/brand/*`, `app/b/**`)는 `products`·`product_costs`·`vendors` 테이블을 직접 조회하지 않는다. `v_*_brand` 뷰만.
- 상태 변경은 Server Action → `assertTransition()` → `ownerAndDue()`. 클라이언트는 버튼만.
- 가격은 `lib/pricing.ts`만. 발행·확정 시 DB에 고정.
- 원가·원청·설정·용어 사전은 서비스 롤(`lib/supabase/admin.ts`)에서만, 역할 검증 후.
- 결제·PG·세금계산서 자동 발행 코드는 어떤 단계에도 없다.
