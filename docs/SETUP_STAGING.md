# 스테이징(시험 서버) 세팅 — 직접 하실 일은 3가지

개발은 끝났고, 실제 인터넷 주소로 열어 보려면 서버(Supabase)와 호스팅(Vercel) 계정이 필요합니다. 계정 만들기·로그인은 본인만 할 수 있어서, 나머지는 전부 스크립트(`scripts/setup-staging.mjs`)가 합니다.

## 직접 하실 일

**1. 토큰 2개 발급** (각 1분)
- Supabase: https://supabase.com/dashboard/account/tokens 에서 로그인 → **Generate new token** → 복사
- Vercel: https://vercel.com/account/tokens 에서 로그인 → **Create Token** → 복사
  - Vercel은 **Pro 플랜**이어야 합니다. 5분마다 도는 알림 작업이 있는데, 무료 플랜은 하루 1번만 돌려 줍니다.

**2. 파일에 붙여넣기**
- 저장소 폴더의 `.env.staging.example`을 복사해 이름을 `.env.staging`으로 바꿉니다.
- 맨 위 두 줄 `SUPABASE_ACCESS_TOKEN=`, `VERCEL_TOKEN=` 뒤에 붙여넣습니다.
- 메일·번역·카카오 키는 있으면 넣고, 없으면 비워 두세요. 그 기능만 꺼진 채로 세팅됩니다. 나중에 넣고 다시 실행하면 켜집니다.
- 이 파일은 GitHub에도, Vercel에도 올라가지 않습니다.

**3. Claude Code에 "스테이징 세팅 실행해줘"라고 말하기**
- 직접 하려면 터미널에서 `node scripts/setup-staging.mjs`를 실행하면 됩니다.

## 스크립트가 하는 일
1. Supabase 서울 리전에 `osle-select-staging` 프로젝트를 만듭니다.
2. DB 구조 52개 파일을 차례로 넣습니다.
3. 시험용 계정·데이터를 넣고, 시험 계정 비밀번호를 무작위 값으로 바꿉니다.
4. 로그인 방식을 설정합니다: 초대 전용, 6자리 인증번호 10분, 카카오. 파일 저장소 6개는 전부 비공개로 만듭니다.
5. Vercel 프로젝트를 만들고 환경변수를 넣은 뒤 배포합니다. 그다음 `/api/health`로 상태를 확인합니다.
6. 화면 자동 테스트(E2E)는 `node scripts/setup-staging.mjs --e2e`로 돌립니다.

여러 번 실행해도 됩니다. 이미 끝난 단계는 건너뜁니다. 실행 중 만든 값(DB 비밀번호, 시험 계정 비밀번호 `E2E_PASSWORD`, 접속 주소 `STAGING_URL`)은 `.env.staging` 맨 아래에 저장됩니다.

## 운영(실서비스)은 다르게
운영 서버에는 시험 데이터를 넣으면 안 됩니다. 운영은 `docs/DEPLOY_CHECKLIST.md` 순서대로, 시드 없이 세팅합니다. 운영 세팅용 스크립트는 스테이징이 한 번 돌아간 뒤에 만듭니다.

## 참고: 아직 실제 계정으로 돌려 보지 않은 부분
스크립트는 Supabase·Vercel 공개 API 문서를 기준으로 작성했고, 문법 검사만 했습니다. 실제 계정으로는 아직 실행하지 않았습니다. 첫 실행에서 오류가 나면 메시지를 그대로 Claude Code에 보여 주세요.
