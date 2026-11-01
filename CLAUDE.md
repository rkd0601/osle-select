# CLAUDE.md — OSLE Select (가칭)

이 저장소에서 작업할 때 항상 따르는 규칙. 요구사항의 원천은 `docs/PRD.md`(v1.0)이며, 충돌하면 PRD를 따르고 이 파일을 고친다.

## 프로젝트 한 줄
브랜드가 원하는 상품을 위아더가 중국 현장에서 직접 보고 찾아 **매칭**하고, 자체 검수로 상품 정보와 실물이 일치하는 품질을 보증하는 B2B 플랫폼. 카탈로그·도매 쇼핑몰이 아니다. 결제·세금계산서는 플랫폼 밖에서 수동(영구).

## 스택 (변경 금지, 변경 시 PRD D18 먼저 수정)
- Next.js 15 App Router + TypeScript strict, RSC 기본, 변경은 Server Actions
- Supabase: Postgres + RLS, Auth(이메일 OTP / Kakao OAuth / 비밀번호), Storage(모든 버킷 비공개)
- Tailwind + shadcn/ui, 폰트 셀프호스팅: 한글 Pretendard, **숫자·영문은 SUIT**(`@font-face`에 `unicode-range`로 라틴·숫자 범위를 SUIT에, 한글을 Pretendard에 배정해 한 문장 안에서도 분리 렌더링), 중국어 Noto Sans SC subset
- next-intl: `ko`, `zh-CN`. 역할별 기본 로케일(BRAND/ADMIN=ko, CN=zh-CN)
- Resend + React Email, Claude API(번역), WeCom 그룹 봇 webhook, Vercel
- pnpm, Vitest(단위), Playwright(E2E)

## 디렉터리
```
app/(public)/            랜딩, 로그인, 신청, 초대 수락
app/b/[slug]/            브랜드 영역 (레이아웃에서 slug↔세션 brand 검증, 불일치·미존재 모두 404)
app/cn/                  중국 소싱 영역 (zh-CN 기본, 외부 의존 금지)
app/admin/               관리자
lib/config.ts            서비스명·도메인·브랜드 노출 코드 접두어 등 상수 (가칭 → 일괄 교체 지점)
lib/supabase/            server / browser / admin 클라이언트
lib/db/                  gen types, 역할별 쿼리 (brand/, cn/, admin/)
lib/pricing.ts           가격·샘플비·선금·차감 순수 함수 (테스트 필수)
lib/transitions.ts       객체별 상태 전이 테이블 + assertTransition(entity, from, to, { role, canPurchase })
lib/sla.ts               상태→owner_role·due_at 계산
lib/translate/           Claude API 번역 + glossary 주입 + 역번역 비교 (원가 필드 입력 불가 타입)
lib/exports/             쇼핑몰별 상품 패키지 매핑 (cafe24.ts, godo.ts, imweb.ts, smartstore.ts)
lib/i18n/                ko.json, zh-CN.json
components/domain/       상태 pill, 핸드오프 카드, 타임라인, variant 매트릭스, 라인시트 카드, 금액 내역표, 원문/번역 병기, 입금 안내 카드
emails/                  React Email 템플릿 (ko/zh)
supabase/migrations/     스키마·enum·RLS·뷰·권한 revoke·함수
supabase/seed.sql        로컬 시드
docs/PRD.md              요구사항 원천
```

## 절대 규칙 (위반 시 PR 불가)
1. **원가 비노출.** `product_costs`, `vendors`의 내부 컬럼, `hidden_margin_rate`, `fx_rate`, `weight_g`, `*_zh` 원문은 브랜드 세션 응답에 절대 포함하지 않는다. 브랜드 측 코드(`lib/db/brand/*`)는 `products`·`product_costs`·`vendors` 테이블을 직접 조회하지 않고 `v_*_brand` 뷰만 쓴다. ESLint 룰 + grep 테스트로 차단.
2. **브랜드 분리.** 브랜드 측 모든 쿼리는 RLS + 코드의 `brand_id` 필터 이중 방어. `app/b/[slug]/layout.tsx`가 멤버십 검증, 실패·미존재 모두 `notFound()`.
   **쓰기는 서버 액션만.** 브랜드·CN 세션(authenticated)은 테이블 insert/update 권한이 없다(0008). 모든 변경은 서버 액션이 역할·멤버십을 코드로 검증(`lib/auth/guards.ts`)한 뒤 서비스 롤로 수행하고, 상태 변경은 `lib/db/transition.ts#applyTransition`(assertTransition → ownerAndDue → 낙관적 잠금 → audit_logs) 한 곳을 거친다. 구매 전이는 `canPurchase`(brand_members)를 넘겨야 통과한다.
3. **"제안 = offer 1행".** 가격·수수료·환율·독점·유효기간은 발행 시점에 `offers`에 고정 저장한다. 상품을 복사하는 코드를 쓰지 않는다. 검수(product 상태)와 제안 발행(offer 생성)은 별도 서버 액션이다.
4. **상태 전이는 서버에서만.** 모든 상태 변경은 Server Action → `assertTransition()` → `lib/sla.ts`로 owner_role·due_at 갱신. 클라이언트는 허용 버튼만 렌더.
5. **가격은 `lib/pricing.ts`만.** 화면은 표시용 호출만. 발행·확정 시 결과를 DB에 고정.
6. **공개 조건은 서버가 검사한다.** `canRequestReview(product)`·`canIssueOffer(product)`를 통과하지 못하면 UI 버튼이 비활성이어도 서버가 거부한다.
7. **발주서 담기 조건**(offer interested AND sample feedback interested, 예외 리오더·ADMIN 면제)과 **발주 체인 순서**(재고 확인 → 선금 → 홀딩 → 범위 견적 → 수량 확정 → 최종 견적 → 확정)는 전이 테이블로 강제.
8. **역할은 JWT `app_metadata.role`.** profiles에 role 컬럼을 만들지 않는다. 서비스 롤 키는 `lib/supabase/admin.ts`에서만.
9. **`/cn` 라우트 외부 의존 금지.** Google Fonts·외부 CDN·분석 스크립트 불가.
10. **i18n 문자열 하드코딩 금지.** 고정 문구(반려 사유·검품 결과·미송 안내·입금 안내)는 템플릿 키로.
11. **번역 액션은 원가를 받지 않는다.** 입력 타입에서 제거. 구조화 필드(혼용률·사이즈·세탁·컬러)는 번역하지 않는다.
12. **감사 로그.** 대행(on_behalf_of_brand), 가격 수정, 발주 확정, 입금 확인, 환율/마진 변경.
13. **PG·결제·세금계산서 자동 발행 코드를 추가하지 않는다.** 청구 내역·입금 신고·확인 플래그까지만.

## 코딩 규칙
- Server Action은 `'use server'` 파일에, 입력 zod 검증, 반환 `{ ok: true, data } | { ok: false, error }`.
- DB 타입은 `pnpm supabase gen types typescript --local > lib/db/types.ts`. 수동 수정 금지.
- 마이그레이션은 되돌릴 수 있게. enum 추가는 `alter type ... add value`. RLS·뷰·권한 변경은 별도 커밋.
- 이미지: 클라이언트 리사이즈(2000px WebP 0.85) → 서명 URL 직접 업로드 → 실패 시 서버 프록시 업로드. `/cn`은 오프라인 큐(IndexedDB).
- 금액 정수 KRW, 원가 numeric(10,2) CNY, `Intl.NumberFormat('ko-KR')`. 날짜 UTC 저장, 역할별 TZ 표시.
- 알림은 `notify(event)` 한 곳에서 kind(instant|digest)·채널을 결정. 직접 이메일을 보내는 코드를 흩뿌리지 않는다.
- 공통 컴포넌트는 `components/domain/`에서만 만들고 재사용. 도매 쇼핑몰식 상품 그리드 컴포넌트를 브랜드 영역에 만들지 않는다.
- 디자인 방향(PRD D19, Figma 04 Design Direction): 에디토리얼 그리드·큰 실물컷·여백·1px 룰, 숫자는 SUIT tabular로 크게. shadcn 기본 스타일을 그대로 두지 말고 토큰(잉크/페이퍼/시그니처)으로 재정의한다. 세부 비주얼은 디자인 라운드 후 토큰만 교체되도록 CSS 변수로 만든다.
- variant 매트릭스는 체크박스가 아니라 숫자 입력(샘플 요청서 기본 1, 발주서는 확보 수량 이내).

## 테스트 필수
- `lib/pricing.ts`: tier 선택, 10원 올림, 수수료, 샘플 물류비, 미회수 차감 1회, 선금 정산.
- `lib/transitions.ts`: 객체별 허용/비허용 전이 전수, 발주 체인 순서, 발주서 담기 조건.
- E2E 원가 누출: 브랜드 세션으로 모든 라우트·액션 순회, 금지 키 검사.
- E2E 브랜드 분리: 브랜드 A → 브랜드 B 리소스 전부 404.
- E2E 공개 조건: 조건 미충족 상품 검수 요청·발행 거부.

## 작업 방식
- 브랜치·PR 이름은 PRD 화면 ID: `feat/A-04-offer-issue`.
- PRD에 없는 기능은 먼저 PRD에 추가·커밋 후 구현. 기획서(웹 보고서)와 PRD가 다르면 기획서 우선, PRD 수정.
- 큰 작업 전 계획 제시 → 승인 → 구현. 마이그레이션·RLS 변경은 항상 별도 커밋.
- 커밋: `feat(B-06): 샘플 요청서 variant 매트릭스`.

## 로컬 실행
```
pnpm i
pnpm supabase start
pnpm supabase db reset
pnpm dev
```
환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `WECOM_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL`.

## 용어
- 요청(request) / 항목(request_item): 브랜드가 올린 건과 그 안의 아이템 단위
- 상품(product): 중국측이 실물 확인 후 등록한 후보. 원청(vendor) 기본값 상속
- 제안(offer): 상품 1 × 브랜드 1 × 항목 1 × 가격. 첫 제안·재제안·추천 모두 같은 객체
- variant: 컬러 × 사이즈. 샘플·발주 라인의 최소 단위
- 샘플 요청서 / 발주서: 여러 제안의 variant를 묶는 단위
- 회수: 샘플 반납. 원칙. 미회수면 상품가 청구
- 홀딩: 선금 입금 후 재고 확보. 재고 확인 뒤에만 안내
- 미송: 발주 라인 일부가 늦게 나오는 상태. 위아더가 원청과 직접 관리
- 검수(review): 상품 품질·번역·공개 조건 확인. 발행(issue)과 다르다
- 검품(inspection): 샘플·본품 실물 검사. 기준서 = 상품 정보 필드 1:1
