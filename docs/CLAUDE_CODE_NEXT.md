# Claude Code 다음 작업 (2026-11-02 r10 → 대기)

> §0 커밋만 하고 **멈춘다.** 이후 서버·DB·배포는 사람 개발자가 이어받는다(`docs/DEVELOPER_HANDOVER.md`). 새 기능을 시작하지 말 것.

## 0. Cowork r10 수용 (Cowork가 §1·§2를 직접 반영했다 — Jay 지시)
- `docs/REVIEW_2026-11-02_r10.md` · `docs/STEP13_NOTES.md` "마감" · `docs/COWORK_DECISIONS.md` "r10" 표. 게이트(vitest 212 · tsc · eslint · build · db:check 38/38) → 커밋 2개: (a) `fix(db): 0052 approve_slug_change RPC + SQL 38` (b) `fix(a11y,admin): slug 승인 RPC 호출·템플릿 리터럴 대비 검사·잔존 2곳; docs: HANDOFF·STEP13 마감`. 다음 마이그레이션 번호 **0053**.
- `docs/HANDOFF.md` §8 CI 파일 설명이 실제 `.github/workflows/*`와 맞는지 한 번 확인(Cowork 복제본엔 그 폴더가 없었다).

## 1. 그 뒤 — 대기 (Jay 입력 필요, `docs/DEPLOY_CHECKLIST.md`)
- 스테이징 Supabase 프로젝트 → `db push` 0001~0052 → 스테이징 시드 → Vercel Preview + 환경변수 → `e2e.yml` 첫 실행 → 셀렉터 보정 → 로그인 서버 액션 전환(11-3).
- 디자인 라운드 → `DESIGN_TOKENS.md` Figma 칸 → `:root` 교체(13-3) → 대비 후보 2색 결정(11-1) → 남은 `muted` 85곳.
- CN_VENDOR 활성화 → 원청 라벨 교체(13-1) → 원청별 웹훅 입력(A-08).
