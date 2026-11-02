# Claude Code 다음 작업 (2026-11-02 r8 → 10단계 마감 · 11단계)

> 멈추지 말고 위에서부터.

## 0. Cowork r8 수용
- `docs/REVIEW_2026-11-02_r8.md` → `git status` → 게이트(vitest 194 · tsc · eslint · build · db:check 35/35) → 커밋 2개: (a) `fix(db): 0048 설정 쓰기 원자화(update_setting RPC·이력 트리거 insert/update/delete)` (b) `fix(settings,exports,audit,b-10): 이력 이중 기록 제거, zip 48MiB 상한·Storage 전역 50MiB, LIKE 이스케이프, 중복 초대 차단, SPEC 12열`.
- `docs/COWORK_DECISIONS.md` "r8" 표 전부 읽기. 다음 마이그레이션 번호 **0049**.

## 1. 10단계 마감 보강 (DECISIONS r8)
- r8-8 코멘트 묶기 기준을 "마지막 실제 발송 행"으로(`lib/notify-delivery.ts`) + 테스트(0·8·16분 → 0·16분 발송).
- r8-3 번역 액션: 사전에 없는 용어 짝을 `approved=false`로 자동 적재(`lib/translate`, (ko, zh) 유니크 — 0049).
- r8-4 B-10 멤버 목록에 없는 작성자 "(전 멤버)" 라벨(요청·샘플 상세).
- r8-5 옛 slug 90일 재사용 금지(브랜드 생성·slug 승인 양쪽, `brand_change_requests.approved` 대조) + SQL 체크.
- r8-6 A-08 환율 저장 결과에 "처리 n건 / 상한 도달" 표시.
- `GETTING_STARTED.md`: Storage 전역 상한 50MiB, 스테이징 Supabase + Vercel Preview에서 `E2E_BASE_URL`로 E2E 돌리는 절차(r8-11).
- `docs/STEP10_NOTES.md` 마감 갱신.

## 2. 11단계 (디자인 토큰 라운드 · 접근성 · 성능) — STEP10_NOTES 계획대로
- 토큰 정리(`app/globals.css` 잉크·페이퍼·시그니처·경고·위험·라인·표면), 임의 색·간격 목록 → 토큰/유틸 교체, `.num` SUIT tabular 점검, shadcn 기본 스타일 잔존 grep. **Jay 디자인 라운드 전까지 값은 바꾸지 않고 구조만** — 토큰만 교체되게.
- 접근성: `<label>` 연결, 포커스 링 토큰, 색 대비(warn·muted on paper 4.5:1), 키보드로 variant 매트릭스·체크 목록, `lang="zh-CN"`, 상태 pill 텍스트 대체.
- 성능: 라우트별 First Load JS 표(클라이언트 컴포넌트가 zod·서버 상수를 끌고 오는 곳), 서명 URL 일괄 발급, 목록 N+1(브랜드 요청·제안·발주), `listUsersByRole` 캐시, `/cn` 오프라인 큐 외부 의존 0 재확인.
- 마감 → `docs/STEP11_NOTES.md` → 12단계(배포 준비: 스테이징 Supabase·Vercel·크론 Pro·환경변수·시드 제거·운영 체크리스트) 계획.
