# 12단계 노트 — 배포 준비 (코드 쪽 먼저)

Claude Code(개발) → Cowork(기획·검증). 기준: STEP11_NOTES "12단계 계획". `CLAUDE_CODE_NEXT`가 r8 그대로(전부 완료)라 계획에 있던 항목 중 **외부 계정 없이 저장소 안에서 끝나는 것**만 먼저 했다. 스테이징·Vercel·키 발급은 Jay 몫(`docs/DEPLOY_CHECKLIST.md`).

## 한 것 (2026-11-02)
- **환경변수 점검** `lib/env.ts`(순수, 값은 절대 돌려주지 않음): 필수 5개 누락(운영 error·로컬 warn), 권장 6개 누락(warn), 운영에서 localhost·http 주소·32자 미만 `CRON_SECRET`(error), 메일·카카오 키 짝 불일치(warn), `NEXT_PUBLIC_*`에 SERVICE_ROLE·SECRET이 들어간 경우(error). `instrumentation.ts`가 서버 시작 때 이름·문제만 로그로(앱은 멈추지 않음). 테스트 5.
- **헬스 체크** `GET /api/health`: 공개 응답은 `{ok, db}`만(503이면 문제), `Authorization: Bearer ${CRON_SECRET}`이면 문제 이름 목록까지. 공개 경로에 추가(모니터링 서비스는 세션이 없다), `no-store`.
- **크론 시크릿 비교를 상수 시간으로** `lib/auth/bearer.ts`(크론·헬스 공용).
- **운영 사전 점검 SQL** `supabase/checks/prod_preflight.sql`(읽기 전용): 시드 계정·브랜드·원청, `test_login`, 서비스 전용 함수 실행 권한(`update_setting`·`use_brand_credit_for_order`), 원가·설정 테이블 세션 권한, anon 신청 insert, **RLS 꺼진 public 테이블**, 환율·입금 계좌, 공개 버킷. PGlite 러너가 시드 DB에서 돌려 **시드 흔적·계좌 미입력만** 걸리는지 확인 → RLS·권한 쪽은 0건(스키마 검증 겸).
- **CI 파일**(푸시 안 함): `.github/workflows/ci.yml`(테스트·tsc·lint·빌드(자리표시 env)·PGlite SQL+사전 점검), `.github/workflows/e2e.yml`(Vercel Preview `deployment_status` 성공 → 그 URL로 Playwright, Deployment Protection 우회 헤더는 `playwright.config.ts`가 시크릿 있을 때만).
- **`docs/DEPLOY_CHECKLIST.md`**: Supabase(스테이징→운영)·Vercel·E2E·운영 첫날 체크리스트.

## Cowork 동시 수정 충돌 (확인 요청)
작업 중에 Cowork가 `lib/i18n/ko.json`·`app/admin/settings/actions.ts`·`docs/CLAUDE_CODE_NEXT.md`·`docs/REVIEW_2026-11-02_r8.md`를 고쳤다. **Cowork 복제본이 개발 커밋 2024490(r8-8)·268fa9e(r8-6)·875ba60(사전 분리) 이전 상태**라:
- `ko.json`: 11단계에서 `ko.admin.json`·`ko.cn.json`으로 옮긴 관리자·cn 키 409개를 공통 사전에 되돌려 넣었고, 그 사이 추가된 `author.*`·`a11y.*` 25개가 빠졌다 → i18n 테스트 3개 실패(공통 사전에 "숨은 마진"이 다시 들어가 브랜드 번들에 실린다). 새 키는 `settings.fxDoneCapped` 하나 — 개발 쪽 `settings.fxCapped`와 같은 뜻.
- `settings/actions.ts`: 환율 결과를 `{fxRechecked, fxCapped}`로 바꿨는데 화면(`settings-forms.tsx`)은 개발 쪽 `{fx: {products, scanned, capped}}`를 읽는다 → 저장 후 결과 문구가 "저장했어요"로만 나온다(타입 오류는 없음).
- r8-6·r8-8은 개발 쪽에 이미 들어가 있다(테스트 포함).

이 두 파일은 **커밋하지 않고 그대로 두었다**(남의 미커밋 변경이라 내가 되돌리지 않음). 사본: 스크래치패드 `cowork-stale/`(ko.json·settings-actions.ts·diff). 권장: 두 파일을 HEAD로 되돌리고 Cowork 복제본을 `d6d4d90` 이후로 동기화.

## r9 반영 (2026-11-02, 마감)
- **충돌 정리**: Cowork r9 재구성본 대신 HEAD 유지 — 재구성본에 브랜드 화면이 쓰는 키 3개(`inspect.match`·`inspect.mismatch`·`bsettings.error.invite`)가 빠져 있었다. Cowork 사본은 스크래치패드 `cowork-r9/`. 문서(REVIEW r9·DECISIONS r9·NEXT r9)는 커밋, CLAUDE.md에 r9-3 협업 규칙.
- **MED r9-1 slug 승인 원자화**: 요청 행을 먼저 `pending→approved` 조건부로 닫고(0행이면 중단) slug 교체, 실패(중복·쿨다운) 시 `pending`으로 복원. 마이그레이션 없이 코드 순서로 — 쿨다운 `previous_value`·감사·알림이 항상 slug 교체와 같이 간다. (DB 경합 테스트는 E2E 환경에서.)
- **LOW r9-2**: 원가·원청 편집 문구 25키(`product.cost*`·`product.vendor*`·`product.error.noCost/tier*/vendor*`·`product.option.cost`·`product.field.costTiers/vendorId/default_hold`·`product.check.cost/vendor`·`product.detail.inherit*`)를 cn 사전으로. 공통 사전에서 `원가|成本|原价` 0, 테스트 SENSITIVE 확장.
- **LOW r9-3·4**: `/api/health` 공개 DB 조회 인스턴스별 60초 캐시(Bearer 상세는 즉시), 운영 판정 `isProductionEnv` = `VERCEL_ENV==="production"`만(instrumentation 포함) + 테스트.
- 질문 답: 1 공개+캐시, 2 서울 기본(DECISIONS 12-1·12-2).

## 남은 일 (외부 입력 대기)
- 스테이징 Supabase·Vercel Preview 생성 → `e2e.yml` 첫 실행 → 셀렉터 보정.
- 로그인 번들 209kB(브라우저 Supabase 클라이언트) → 서버 액션 로그인으로(E2E가 도는 환경에서, STEP11 질문 3).
- CN_VENDOR 활성화 전: 원청별 WeCom 웹훅(DECISIONS r6-4), cn 사전 원청용 분리(STEP11 질문 4).

## 질문
1. `/api/health` 공개 응답(`ok`·`db`)을 외부 업타임 모니터(UptimeRobot 등)에 붙일지, 내부만 볼지. 기본값: 공개(값 노출 없음).
2. 운영 리전 — 서울 기본. 중국 접속 측정 결과가 나쁘면 Storage만 홍콩/R2로(PRD 11장).

게이트(마감): vitest 209 · tsc · eslint · build · SQL 36/36 + 사전 점검. 이후 13단계는 STEP13_NOTES.
