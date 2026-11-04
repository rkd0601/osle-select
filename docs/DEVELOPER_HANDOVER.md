# 개발자 인수인계 — OSLE Select (가칭)

2026-11-02 기준. 이 저장소는 기획(위아더 Jay) + 두 AI 에이전트(구현 Claude Code · 검증 Cowork)가 13단계에 걸쳐 만들었다. **기능 개발은 끝났고, 서버·DB·배포는 아직 아무것도 만들지 않았다.** 이 문서는 그 뒷부분을 맡을 개발자가 처음 읽는 페이지다. 30분이면 전체 그림이 잡히도록 썼다.

## 1. 지금 상태 한 줄

| 항목 | 상태 |
|---|---|
| 기능(브랜드 요청 → 중국 소싱 → 상품 등록·검수 → 제안 → 샘플 → 발주·청구 → 수출 패키지 → 관리자 설정·감사·알림) | **완료**, 13단계 노트까지 |
| 테스트 | vitest 215 · tsc · eslint · `next build` · 로컬 PG 체크 39/39 — 전부 통과(2026-11-04 전체 검증) |
| E2E(Playwright 9개 스펙) | 클라우드 개발 DB로 **8 통과 · 1 skip**(2026-11-04, `STEP14_NOTES.md` §6) — skip은 B-12 패키지(발주 확정 시드) |
| Supabase / Vercel / 외부 키 | 클라우드 **개발** DB만(0053 미적용 — `supabase db push` 필요). 스테이징·운영·Vercel·외부 키 **없음** — 이 문서 §4 |
| 디자인 | 토큰 구조만. Figma 라운드 후 값 교체(`docs/DESIGN_TOKENS.md`) |

## 2. 먼저 읽을 문서 (이 순서로)

0. `docs/VERIFICATION_2026-11-04.md` — 전체 검증 결과와 남은 일 목록(운영 전 처리할 LOW 15·화면 공백 8). `docs/UX_REVIEW_2026-11-04.md` — 테스트 서버에서 전 흐름을 실제로 돌린 UX 검토(고친 7건, 넘기는 6건).
1. `docs/HANDOFF.md` — 운영 핸드오프. 아키텍처·역할 권한표·돈 흐름·설정·크론·알림·배포/롤백·장애 대응·비밀값. **코드 근거가 절마다 붙어 있다.**
2. `CLAUDE.md` — 절대 규칙 13개(원가 비노출·브랜드 분리·쓰기는 서버 액션만·전이표…). 사람이 코딩할 때도 그대로 지킨다. 맨 아래 "Cowork 협업 프로토콜"은 AI 에이전트용이라 지워도 된다.
3. `docs/PRD.md` — 요구사항 원천. `docs/COWORK_DECISIONS.md` — 개발 중 내린 결정 100여 건(PRD와 같은 효력, 충돌 시 PRD를 고친다).
4. `docs/DEPLOY_CHECKLIST.md` + `docs/GETTING_STARTED.md` — 서버·DB 세팅 절차. §4의 일이 여기 있다.
5. `docs/STEP4_NOTES.md` ~ `STEP13_NOTES.md` — 단계별 "한 일 / 안 한 일 / 질문(답은 DECISIONS)". `docs/REVIEW_*.md` — 검증 라운드별로 잡은 결함과 고친 파일.

## 3. 로컬에서 돌려 보기

```
pnpm i
pnpm test                 # 단위 212
pnpm db:check:lite        # PGlite(WASM): 마이그레이션 0001~0053 + 시드 + 체크 39 — Docker·PG 없이, Windows OK
pnpm db:check             # 로컬 PG16으로 같은 검증 (root가 아닌 사용자)
pnpm supabase start && pnpm supabase db reset && pnpm dev   # Docker 있는 환경
```
시드 계정은 `supabase/seed.sql`(비밀번호 `password123`, **운영 금지**). 환경변수 목록은 `.env.example`·`lib/env.ts`(서버 시작 때 누락·오설정을 로그로 알린다).

## 4. 넘겨받는 일 (서버·DB·배포)

`docs/DEPLOY_CHECKLIST.md` A→D 순서 그대로. 요점만:

1. **Supabase** 스테이징 → 운영 두 번. 서울 리전, PITR. `supabase link` → `pnpm supabase db push`(0001~0053). 운영엔 시드 금지. Auth(이메일 OTP·비밀번호·Kakao, 가입 허용 끔), Storage 버킷 6개 비공개 + 전역 상한 50MiB. 첫 ADMIN은 JWT `app_metadata.role='ADMIN'`(GETTING_STARTED §4). 마지막에 `supabase/checks/prod_preflight.sql` → `PREFLIGHT OK`.
2. **Vercel** Production/Preview 환경변수 분리(Preview = 스테이징 DB). **Pro 플랜**(크론 7개, `vercel.json`). 배포 후 `GET /api/health` → `{"ok":true,"db":true}`, Bearer `CRON_SECRET`로 상세.
3. **외부 키** Resend(도메인 인증 + `MAIL_FROM`), Kakao 개발자 앱, WeCom 그룹 봇, Anthropic(번역). 이름은 `lib/env.ts`.
4. **E2E** GitHub Secrets 넣고 Preview 배포 → `.github/workflows/e2e.yml` 자동 실행. 첫 실행에서 셀렉터 보정 예상(`tests/e2e/*.spec.ts`).
5. 그 뒤 코드 쪽 남은 두 가지: 로그인 흐름을 서버 액션으로(번들 209kB, DECISIONS 11-3 — E2E가 도는 환경에서), 원청(CN_VENDOR) 계정 활성화 전 라벨 교체·웹훅 입력(DECISIONS 13-1·13-2).

## 5. 손대기 전에 알아야 할 설계 세 가지

- **돈과 원가는 DB 권한으로 막혀 있다.** `authenticated` 롤은 `products`·`product_costs`·`vendors`·`settings`… 테이블을 읽을 수 없고(0005 등 revoke), 브랜드 화면은 `v_*_brand` 뷰만 쓴다. 테이블을 직접 읽는 코드는 ESLint + `tests/unit/brand-boundary.test.ts`가 막는다. 새 화면을 만들 때 뷰부터 만든다.
- **세션은 아무것도 쓰지 못한다.** 모든 변경은 서버 액션 → 역할 검증(`lib/auth/guards.ts`) → 서비스 롤. 상태 변경은 `lib/db/transition.ts#applyTransition` 한 곳(전이표 → SLA → 낙관적 잠금 → 감사 로그). 돈이 걸린 다단계 쓰기는 plpgsql RPC(`update_setting`·`use_brand_credit_for_order`·`approve_slug_change`)로 트랜잭션을 묶었다 — 같은 패턴을 따른다.
- **i18n 사전이 4겹이다.** 공통 `ko.json`(브랜드 번들) ⊂ `ko.cn.json` ⊂ `ko.admin.json`, 소싱 담당 전용 `cn-sourcer`(server-only). 관리자·원가 문구가 브랜드 번들에 실리면 테스트가 깨진다(`tests/unit/i18n.test.ts`). 문자열 하드코딩 금지(규칙 10).

## 6. 현재 작업 트리 메모 (2026-11-04 갱신)

**전체 검증(`docs/VERIFICATION_2026-11-04.md`)이 반영한 파일이 아직 커밋 전**일 수 있다: `supabase/migrations/0053_verification_locks.sql`, `app/admin/orders/actions.ts`, `app/b/[slug]/orders/actions.ts`, `lib/db/admin/orders.ts`, `lib/db/admin/export-snapshots.ts`, `lib/exports/common.ts`, `lib/i18n/ko.json`, `tests/sql/10_checks.sql`, `tests/unit/exports.test.ts`, `.gitignore`, `.vercelignore`, `docs/*`, 그리고 UX 검토분 `app/b/[slug]/page.tsx`·`lib/handoff.ts`·`lib/db/brand/settings.ts`·`lib/db/admin/brands.ts` 등(`docs/CLAUDE_CODE_NEXT.md` §0-b). `git status` → 게이트(§3, 체크 39) → 두 커밋: (a) `fix(db): 0053 …` (b) `fix(orders,exports): …`(문구는 `docs/CLAUDE_CODE_NEXT.md` §0). 마이그레이션 다음 번호 **0054**. 루트의 `osle-select 로컬 셋팅.zip`(비밀값 포함)은 저장소 밖으로.

검증에서 넘기는 LOW 15건·화면 공백 7건(B-01 홈은 2026-11-04 UX 검토에서 완성)·테스트 공백은 VERIFICATION §4 — 운영 전 일괄 처리 권장(전부 S). UX 검토에서 넘기는 P2~P6(§3)과 2차 P7~P15(§8: 발주서 제목 구분·대시보드 행 제목·CN 상품 첫 진입 500 재확인·서버 액션 지연·모바일 수량표·E2E 데이터 정리)는 `UX_REVIEW_2026-11-04.md`. **P1(최종 견적 브랜드 동의 절차)은 Jay 결정 뒤 전이표 변경.**

`docs/CLAUDE_CODE_NEXT.md`·`docs/REVIEW_*.md`·`docs/COWORK_DECISIONS.md`의 "Cowork/Claude Code" 표현은 두 AI 에이전트를 가리킨다. 이후는 사람이 이어가므로 NEXT 파일은 지워도 되고, DECISIONS는 결정 기록으로 계속 쓰면 된다.

## 7. 연락·결정 주체

기획·우선순위·디자인 결정은 위아더 Jay. 결정이 필요하면 `docs/COWORK_DECISIONS.md`에 질문을 적고 답을 받은 뒤 표에 남기는 방식을 그대로 쓰면 기록이 이어진다.
