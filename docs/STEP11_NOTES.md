# 11단계 노트 — 디자인 토큰 라운드(구조) · 접근성 · 성능

Claude Code(개발) → Cowork(기획·검증). 기준: PRD D19(Figma 04 Design Direction), CLAUDE_CODE_NEXT r8 §2 — **Jay 디자인 라운드 전까지 값은 바꾸지 않고 구조만**(토큰만 교체되게).

## 한 것 (2026-11-02)
커밋: 5c6c954(토큰) · dc14d14(접근성) · 접근성 정적 테스트 · 875ba60(사전 분리) · 성능(디렉터리 조회)

### 1. 디자인 토큰 (값 그대로, 구조만)
- 색: 화면 코드에 임의 색·Tailwind 기본 팔레트·`bg-[#…]`이 **0곳**(이미 잉크·페이퍼·시그니처·경고·위험·라인·표면·샌드 토큰만 씀). `#888888` 1곳은 컬러 피커 기본값(데이터).
- **타입 스케일 토큰화**: `text-[Npx]` 17종 877곳 → `:root --fs-*` + `@theme --text-*` 유틸(`text-micro 10 · caption 11 · meta 12 · body 13 · lead 14 · strong 15 · h5 16 · h4 17 · h3 18 · h2 20 · h1-s 22 · h1 24 · title 26 · title-l 28 · display-s 32 · display 40 · display-l 48`). 빌드 CSS에서 17개 유틸 생성·값 동일 확인. 디자인 라운드에서 스케일을 줄이면(예: 15·17 제거) `:root`만 고치고 유틸 이름은 남긴다.
- 라운드: `rounded-[var(--radius)]` 16곳 → `rounded-ui`.
- 포커스 링 토큰 `--focus`(= 시그니처) · `--focus-width` + 전역 `:focus-visible` 외곽선(키보드 포커스만).
- `.num`(SUIT tabular) 유지 확인. shadcn 기본 스타일 잔존 **없음**(`components/ui` 자체가 없다 — 공통 컴포넌트는 `components/domain`만).
- 남은 임의 값: `tracking-[0.3em|0.16em|0.18em]` 5곳·`leading-[1.15]` 1곳(랜딩·라벨) — 디자인 라운드 때 같이.

### 2. 접근성
- **이름 없는 폼 컨트롤 84곳 → 0**: placeholder만 있던 46곳은 같은 문구로 `aria-label`, 맥락 레이블이 필요한 32곳은 `a11y.*` 키(관리자 ko, /cn은 zh도). `tests/unit/a11y.test.ts`가 계속 막는다(`<label>` 안 · aria-label · id · 숨김만 허용).
- 아이콘만 있는 `×` 버튼 9곳에 접근 이름(삭제·닫기, /cn은 zh) + 테스트.
- `lang`: 루트 `ko`, `/cn` 레이아웃 `zh-CN`, 원문 병기(`Bilingual`·검수 행·코멘트 원문)에 `zh-CN` — 이미 있음. 관리자 목록의 `name_ko || name_zh` 대체 표시는 zh일 때 lang 없음(낮음, 남김).
- 상태 pill: 색만이 아니라 상태 이름 텍스트가 들어 있어 대체 텍스트 문제 없음. variant 매트릭스는 셀마다 `aria-label="{컬러} {사이즈}"` 숫자 입력 — 키보드 Tab·숫자 입력으로 조작됨.
- **색 대비(4.5:1) — 값은 안 바꿨다, Jay 라운드에 넘김**:

| 조합 | 대비 | 판정 | 같은 색조로 4.5:1 넘는 후보 |
|---|---|---|---|
| `muted #8c8f99` on paper | 3.07 | ✗ (본문 크기 텍스트 303곳) | `#64666e` (paper 5.44 · sand 4.63) |
| muted on sand / warn-soft | 2.61 / 2.73 | ✗ | 위와 같음 |
| `warn #b4530a` on warn-soft (pill·대행 배지) | 4.24 | ✗ (살짝) | `#ac4f09` (warn-soft 4.58 · paper 5.15) |
| warn on paper | 4.77 | ✓ | |
| ink-2 on paper | 6.87 | ✓ | |
| signature on paper / signature-soft | 6.09 / 5.43 | ✓ | |
| crit on paper | 6.96 | ✓ | |

### 3. 성능
- **사전 분리 (보안 겸)**: 클라이언트 컴포넌트가 `@/lib/i18n`을 import하면 ko·zh 사전 전체(공통 청크 96.9kB)가 실려 **브랜드 브라우저에 "숨은 마진 기본값"·"환율 (1위안 = 원)"·발행 공식("녹인 마진") 같은 내부 문구가 내려가고 있었다**(값은 아님). 사전을 공통 / `cn`(cn.*) / `admin`(admin·settings·audit·glossary·issue·measure·needsInfo)으로 나누고 `app/admin`·`app/cn`만 영역 모듈을 쓴다. 빌드 확인: 숨은 마진 문구는 `/admin/*` 청크에만, `/cn` 청크엔 "목표 원가" 라벨만, 공통 사전 청크 72.6kB. 테스트가 영역 경계·공통 사전의 내부 용어 부재를 막는다.
- First Load JS (공통 123kB):

| 라우트 | 전 | 후 |
|---|---|---|
| `/b/[slug]/requests/new` | 154kB | 147kB |
| `/b/[slug]/orders/[id]` | 154kB | 147kB |
| `/b/[slug]/offers` | — | 143kB |
| `/cn/tasks` | — | 145kB |
| `/cn/products/[id]` | 158kB | 153kB |
| `/admin/requests/[id]` | 155kB | 157kB |
| `/login` · `/invite/[token]` | 216kB | 209kB |

- 클라이언트 번들의 zod: **0**(클라이언트 파일의 `@/lib/comments`·`@/lib/requests` import는 타입뿐, 서버 액션 import는 RPC 참조). A-08 설정 화면은 10단계에서 이미 분리(99.7→3kB).
- 서명 URL: 전부 `signedReadUrls` 일괄 발급(`createSignedUrl` 단건 호출 0).
- 목록 N+1: 화면 로더에는 없음(조회는 `in(...)` 묶음). 쓰기 쪽 반복 update(발주 확정 시 라인 단가, 검품 수량, 컬러명 저장)는 행 수가 작아 남김 — 운영 규모에서 RPC로 묶을 후보.
- `listUsersByRole`: 요청·샘플 상세의 작성자 이름(r8-4)과 B-10 멤버 목록이 상세 화면마다 Auth 사용자 전체를 페이지 순회하던 것 → 20명 이하면 `getUserById`로. 알림·감사 로그는 요청 단위·60초 캐시 그대로.
- `/cn` 외부 의존: 화면 코드에 외부 URL·CDN·분석 스크립트 0(폰트 셀프호스팅, 오프라인 큐 IndexedDB).

## 질문 (보수적 기본값으로 진행)
1. 대비 미달 2색(muted·warn) — 디자인 라운드에서 위 후보로 바꿀지, 아니면 muted를 "보조 정보 큰 글씨 전용"으로 줄이고 본문 크기 보조 텍스트는 ink-2로 옮길지. 기본값: 값 유지, 라운드 때 결정.
2. 타입 스케일 17단계는 많다(15·17·22·26 등 한두 곳만 쓰는 값). 라운드에서 9단계쯤으로 접을지 — 유틸 이름은 남겨 두어 `:root`만 바꾸면 된다.
3. `/login`·`/invite` 209kB의 대부분은 브라우저 Supabase 클라이언트(OTP·Kakao). 로그인 흐름을 서버 액션(쿠키 설정)으로 옮기면 크게 준다 — 인증 흐름 변경이라 E2E가 도는 환경(12단계 스테이징)에서 하자는 게 기본값.
4. `/cn` 번들의 "目标进价/목표 원가" 라벨은 CN_VENDOR(외부) 계정에도 실린다(값은 없음 — 값 노출은 E2E가 HTML로 본다). CN_VENDOR 활성화 전에 cn 사전을 소싱 담당용/원청용으로 한 번 더 나눌지.

## 12단계 계획 (배포 준비)
- **스테이징 Supabase**: 프로젝트 생성 → `db push`(0001~0049) → 시드(스테이징 전용) → Auth(이메일 OTP·Kakao·비밀번호) 설정 → Storage 버킷 6개 비공개·전역 50MiB.
- **Vercel**: Production/Preview 환경변수 분리(서비스 롤 키는 Production·Preview 각각, 클라이언트 노출 `NEXT_PUBLIC_*`만), **크론 Pro 플랜**(7개 job), `CRON_SECRET`, 도메인·Auth Redirect URL.
- **E2E 실제 실행**: Preview + 스테이징에서 `E2E_BASE_URL`로 `security.spec`·`stage10.spec` — 첫 실행 결과로 셀렉터 보정. GitHub Actions `deployment_status` 연결.
- **시드 제거·운영 체크리스트**: 운영 DB에 `seed.sql` 금지(비밀번호 계정), 첫 ADMIN은 GETTING_STARTED §4 절차, `00_local_auth_shim`·`test_login`은 로컬 전용 확인, 운영 settings 값(환율·마진·수수료·계좌) 입력, Resend 도메인 인증·`MAIL_FROM`, WeCom 웹훅, Anthropic 키·모델, 백업(PITR)·로그 보존, 개인정보(주소·연락처) 처리 방침 문구.
- **로그인 번들**(질문 3): 스테이징 E2E가 돌면 OTP·비밀번호 로그인을 서버 액션으로.
- 마감 → `docs/STEP12_NOTES.md`.

게이트: vitest 203 · tsc · eslint · build · SQL 36/36. 다음 마이그레이션 번호 **0050**.
