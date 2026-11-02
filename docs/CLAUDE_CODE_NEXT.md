# Claude Code 다음 작업 (2026-11-02 r9 → 12단계 마감 · 13단계 계획)

> 멈추지 말고 위에서부터.

## 0. Cowork r9 수용
- `docs/REVIEW_2026-11-02_r9.md` → `git status`. `lib/i18n/ko.json`·`app/admin/settings/actions.ts`는 Cowork가 네 분리 규칙대로 **재구성해 둔 상태**(테스트 통과) — 그대로 커밋하거나 `git checkout HEAD -- lib/i18n/ko.json app/admin/settings/actions.ts`로 네 버전을 쓰거나, 어느 쪽이든 OK(차이는 a11y 문구). 게이트(vitest 208 · tsc · eslint · build · db:check 36/36) → 커밋.
- `docs/COWORK_DECISIONS.md` "r9" 표 전부 읽기. 다음 마이그레이션 번호 **0050**.
- `CLAUDE.md` 협업 프로토콜에 r9-3 한 줄 추가: "개발이 움직이는 동안(마지막 파일 변경 30분 이내) Cowork는 코드를 쓰지 않는다."

## 1. 12단계 마감 보강 (REVIEW r9)
- **MED** slug 승인 원자화(r9-1): 요청 행 `pending→approved` 조건부 update 먼저 → slug 교체 → 실패 시 복원, 또는 RPC `approve_slug_change`(0050, 세션 revoke) + SQL 체크(취소 경합).
- LOW r9-2: `product.cost`·`product.field.costTiers`·`product.error.noCost`·`product.vendor*`·`product.check.cost/vendor`(ko·zh)를 cn 사전으로, i18n SENSITIVE에 `원가|成本|原价`.
- LOW: `/api/health` 공개 응답 60초 캐시; `production` 판정은 `VERCEL_ENV==="production"`만.
- `docs/STEP12_NOTES.md` 마감 갱신(질문 1·2 답 반영: 공개+캐시, 서울).

## 2. 13단계 계획 (외부 입력 전까지 저장소 안에서 할 수 있는 것)
- **CN_VENDOR 온보딩 준비**: cn 사전을 소싱 담당(`cn.*`)/원청(`vendor.*`)으로 분리(11-4), 원청 계정이 보는 화면 목록·금지 문구 테스트, 원청별 WeCom 웹훅(DECISIONS r6-4) 설정 키.
- **디자인 라운드 준비**: 토큰 목록 문서(`docs/DESIGN_TOKENS.md` — 색·타입 9단계 후보·간격, 현재 값과 Figma 매핑 칸), 대비 미달 2색 후보.
- **스테이징 E2E**: Jay가 Supabase 스테이징·Vercel Preview를 만들면 `e2e.yml` 첫 실행 → 셀렉터 보정 → 로그인 서버 액션 전환(11-3).
- 마감 → `docs/STEP13_NOTES.md`.
