# 운영 배포 체크리스트 — OSLE Select

12단계. 위에서부터 한 줄씩 체크. 절차 상세는 `docs/GETTING_STARTED.md` §2~§6, E2E는 §6 "E2E를 스테이징에서 돌리기".

## A. Supabase (스테이징 → 운영 순서로 두 번)
- [ ] 프로젝트 생성(리전: 서울 `ap-northeast-2` — 중국 접속은 §6-5 측정 후 판단), PITR 백업 켜기
- [ ] `supabase link --project-ref <ref>` → `pnpm supabase db push` (0001~0051 전부, 순서대로)
- [ ] **운영에는 `supabase/seed.sql`을 넣지 않는다** (비밀번호 `password123` 시드 계정). 스테이징만 시드
- [ ] Auth ▸ Providers: Email(OTP·비밀번호), Kakao(키·시크릿), "Allow new users to sign up" 끄기(초대 전용)
- [ ] Auth ▸ URL Configuration: Site URL = 운영 도메인, Redirect URLs = 운영·Preview 도메인
- [ ] Storage: 버킷 6개(request-images·product-images·vendor-cards·sample-photos·inspection-photos·exports) **전부 비공개**, 전역 업로드 상한 50MiB
- [ ] 첫 ADMIN 계정: GETTING_STARTED §4 (JWT `app_metadata.role = 'ADMIN'`, profiles에 role 컬럼 없음)
- [ ] 원청 계정(CN_VENDOR)을 초대한 원청은 A-08 원청 관리에서 **WeCom 웹훅** 입력(없으면 그 원청은 앱 안 알림만 — 사전 점검이 잡는다)
- [ ] A-08 설정에서 운영 값: 환율·숨은 마진·수수료·물류 추정·통관·기간 규칙·카테고리·반려 템플릿·**입금 계좌**
- [ ] **SQL Editor에서 `supabase/checks/prod_preflight.sql` 실행 → `PREFLIGHT OK`** (시드 흔적·test_login·서비스 함수 권한·원가 테이블 권한·RLS 꺼진 테이블·환율/계좌·공개 버킷)

## B. Vercel
- [ ] GitHub 연결, Production 브랜치 지정
- [ ] 환경변수(Production / Preview 따로 — Preview는 스테이징 Supabase):
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` (https, localhost 아님) · `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` — **`NEXT_PUBLIC_` 접두어 금지**
  - [ ] `NEXT_PUBLIC_APP_URL` (https) · `CRON_SECRET` (32자 이상, `openssl rand -hex 32`)
  - [ ] `RESEND_API_KEY` + `MAIL_FROM`(Resend 도메인 인증 완료) — 짝으로
  - [ ] `ANTHROPIC_API_KEY` (`TRANSLATE_MODEL` 선택) · `WECOM_WEBHOOK_URL` · `KAKAO_CLIENT_ID` + `KAKAO_CLIENT_SECRET`
- [ ] **Pro 플랜**(크론 `*/5`·`*/15`·`*/30` — Hobby는 하루 1회라 deliver·cn_gate·sla가 안 돈다), `vercel.json` 7개 job 등록 확인
- [ ] 배포 후 `GET /api/health` → `{"ok":true,"db":true}`. 상세: `curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/health` → `issues`가 비었는지(값은 안 나온다). 공개 응답의 DB 확인은 60초 캐시, 운영 판정은 `VERCEL_ENV=production`만(Preview는 경고만). 서버 로그의 `[env] error …` 줄도 확인
- [ ] 크론 수동 1회: `curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/sla` → 200

## C. E2E (Preview + 스테이징)
- [ ] GitHub ▸ Secrets: `E2E_PASSWORD`(스테이징 시드), Deployment Protection을 쓰면 `VERCEL_AUTOMATION_BYPASS_SECRET`
- [ ] Preview 배포 성공 → `.github/workflows/e2e.yml`이 자동 실행 — 9개 스펙 통과(첫 실행에서 셀렉터 보정 예상)
- [ ] 스테이징 DB는 E2E가 신청·브랜드를 만든다 → 주기적으로 reset + 시드

## D. 운영 첫날
- [ ] 브랜드 1곳 초대(A-07 승인) → 요청 → CN 등록 → 검수 → 발행 → 샘플까지 손으로 한 바퀴(브랜드 화면에서 원가·원청·중국어 원문이 안 보이는지 눈으로)
- [ ] `/cn`을 중국 현지 폰·노트북에서 여러 시간대에 열기(외부 CDN 0, 폰트 셀프호스팅)
- [ ] 알림: 이메일 1통·WeCom 1건 실제 수신, digest 다음 날 09:00 KST 수신
- [ ] 개인정보 처리방침·이용약관 문구(주소·연락처·사업자 정보) — 법무 확인 후 P-01 하단 링크
- [ ] 로그 보존·에러 알림(Vercel Log Drains 또는 대시보드) 담당자 지정
