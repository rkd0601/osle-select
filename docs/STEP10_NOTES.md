# 10단계 노트 — 관리자 설정(A-08) · 용어 사전 · 감사 로그 · 브랜드 설정(B-10) · E2E 묶음

Claude Code(개발) → Cowork(기획·검증). 기준: PRD 5장 설정 키·A-08, CLAUDE.md 절대 규칙 3·5·8·12, DECISIONS r6-2(digest 수신 설정)·r6-3(환율 변경 → 즉시 fxJob)·9-8(slug 변경은 관리자 승인), CLAUDE_CODE_NEXT r7 §2.

## 계획 (착수 2026-11-02)

### A-08 설정 `/admin/settings`
- 키 정의는 `lib/settings-schema.ts` 한 곳(순수): 그룹(환율·마진·수수료 / 물류·비용 / 기간 규칙 / 기타), 단위(원·%·일·시간·개), 범위. 숫자 키는 `DEFAULT_SETTINGS`와 1:1(테스트로 고정). 목록 키: 카테고리·반려 템플릿(code·ko·zh)·입금 계좌.
- 변경은 서버 액션 `updateSetting(key, value)` → zod(키별 범위) → `settings` upsert(updated_by) + `settings_history`(old·new) + 감사 로그. **환율 = `settings.fx_update` + 즉시 `fxJob()`**(r6-3), 그 밖은 `settings.update`(diff key·before·after — 마진·수수료 포함, 절대 규칙 12). settings는 0005에서 authenticated revoke 확인 → 서비스 롤만.
- 발행된 제안은 발행 시점 값 고정(절대 규칙 3) — 화면에 "새 발행부터 적용" 안내.

### 용어 사전 `/admin/glossary`
- 승인 대기(검수 중 CN·관리자가 추가한 `approved=false`) 먼저, 승인된 용어 검색. 승인·수정·삭제·직접 추가(바로 승인). 감사 `glossary.*`.
- 번역은 `approved=true`만 주입(`lib/translate` 확인 — 이미 그렇다).

### 감사 로그 `/admin/audit`
- 필터: 행위자·대상(entity)·액션 접두어·기간. 탭: 전체 / 돈(price.* · payment.* · order.confirm · order.credit · order.invoice_rebuild · brand.credit_adjust · brand.terms_update · sample.charge · sample.credit · settings.*) / 대행(on_behalf_of_brand_id). 대행 행 강조. 100행씩.
- 분류는 `lib/audit.ts` 순수 함수(테스트).

### B-10 브랜드 설정 `/b/{slug}/settings`
- 멤버: 목록(누구나), owner만 초대(구매 권한 선택)·구매 권한 토글·제거(자기 자신·owner 제외). 서버 액션 + `requireBrandAccess` level=owner.
- 기본 배송지(`brands.default_address`) — owner 수정, 멤버 보기.
- digest 수신(`profiles.notify_digest`) — 본인만. instant는 끌 수 없다(r6-2) 문구.
- slug 변경 요청(9-8): 브랜드 owner가 요청 → 관리자 A-07 상세에서 승인·반려 → 승인 시 slug 교체 + 감사 `brand.slug_change`. 새 테이블 `brand_change_requests`(0046) + RLS(0047).

### E2E 묶음 (Playwright)
- 원가 누출: 브랜드 세션 전 라우트 순회(+ B-12 패키지 zip 내용 스캔), 브랜드 A→B 404 전수(새 라우트 포함), 공개 조건 미충족 거부, A-07 승인 → 초대 수락.
- `E2E_BASE_URL` 없으면 skip 유지. `pnpm e2e:local` = 로컬 Supabase(시드) + `next dev` 대상으로 실행.

### 질문 (보수적 기본값으로 진행)
1. 설정 변경 권한: ADMIN 전원? 기본값: ADMIN 전원, 감사 로그로 추적.
2. 숨은 마진·수수료 기본값 변경이 **브랜드별 조건이 없는 브랜드**의 새 발행부터 적용 — 맞는지(브랜드별 값이 있으면 그게 우선).

---

## 진행·마감 (2026-11-02)
커밋: 3f608f4(A-08 설정·용어 사전·감사 로그) · ef6794d(0046) · 1d87d30(0047) · 3e73413(B-10) · a192797(E2E 묶음)

- **A-08 설정** `/admin/settings`: 숫자 키 26개를 `lib/settings-schema.ts` 한 곳에서 정의(그룹·단위·범위, `DEFAULT_SETTINGS`와 1:1 — 테스트 고정). 비율은 화면 %·저장 소수(4자리). 목록 키(카테고리·반려 템플릿 ko/zh·입금 계좌, zod는 `lib/settings-lists.ts` — 화면 번들 분리). 저장 = upsert + `settings_history` + 감사 `settings.fx_update`(환율) / `settings.update`(그 밖, 마진·수수료 포함). **환율 저장 시 즉시 `fxJob`** → 재확인으로 보낸 상품 수를 화면에. 최근 변경 이력 20건.
- **용어 사전** `/admin/glossary`: 승인 대기(approved=false) · 승인된 용어 검색(300건), 추가(바로 승인)·승인/취소·수정(중복 짝 안내)·삭제, 감사 `glossary.*`. 번역 주입은 `approved=true`만(`lib/translate#glossary`, 이미 그렇다).
- **감사 로그** `/admin/audit`: GET 필터(행위자·대상·액션 앞부분·기간 KST), 탭 전체 / 돈 관련(`lib/audit.ts`: price.* · payment.* · settings.* + 발주 확정·크레딧·청구 재생성·견적·입금·브랜드 조건·크레딧 조정·샘플 청구) / 대행(on_behalf). 대행 행 노란 배경 + 브랜드명, 돈 액션 ₩ 표시, diff 펼침, 100행 페이지.
- **B-10** `/b/{slug}/settings`: 멤버 목록(이름·이메일은 `lib/db/users#memberDirectory` — RLS로 확인한 id만 서비스 롤로), owner만 초대(멤버 레벨 고정)·발주 권한 토글·내보내기(자기 자신·owner 불가), 수락 대기 초대, 기본 배송지(샘플 `ShipTo` 모양 그대로, 감사 로그엔 내용 없이), **digest 수신 본인만**(대행 중 잠금, instant는 못 끈다는 안내), **주소 변경 요청** → `brand_change_requests`(0046, 브랜드당 대기 1건) → A-07 상세에서 승인(slug 교체·감사 `brand.slug_change`·브랜드 멤버 즉시 알림 `brand.slug_changed`)/반려. 0047 RLS(SQL 34).
- **owner 초대 가드**: `createInvite`는 서버 액션으로 노출돼 있고 RLS 정책(0007)이 level을 보지 않아, 브랜드 owner가 직접 owner 초대를 만들 수 있었다 → ADMIN이 아니면 owner 초대 거부(코드).
- **E2E 묶음** `tests/e2e/stage10.spec.ts` + `security.spec.ts` 확장: 새 라우트(orders·exports·settings·notifications) 누출 순회·브랜드 B 404, 브랜드의 /admin/settings·glossary·audit·brands 404, B-12 패키지 zip 텍스트 항목(README·CSV·HTML) 금지 키·한자 스캔(무압축 zip 파서 `zipTextEntries`), **공개 조건 서버 거부**(잠긴 승인 버튼을 풀어 강제 클릭 → 새로 고침 후에도 미승인), A-07 공개 신청 → 관리자 승인 → 초대 링크 열림, A-08 범위 밖 환율 안내·감사 돈 탭. `pnpm e2e:local` = 로컬 Supabase 상태 확인 + playwright `webServer`로 dev 서버 자동 기동.
- 게이트: vitest 194 · tsc · eslint · build · SQL 34/34. **E2E는 이 PC에 Docker가 없어 실제 실행 못 함** — 목록·컴파일만 확인(9개 전부 `E2E_BASE_URL` 없음으로 skip). Cowork 복제본이나 Docker 있는 곳에서 `pnpm supabase start && pnpm supabase db reset && pnpm e2e:local` 필요. 다음 마이그레이션 번호 **0048**.

### 질문 추가
3. 용어 사전 "승인 대기" 출처: 지금은 관리자가 검수 화면에서 넣으면 바로 승인이라 대기 목록이 생길 경로가 없다. CN 담당이 C-03 등록 화면에서 용어를 **제안**(approved=false)하게 할지? 기본값: 화면만 준비, 제안 입력은 11단계 이후.
4. B-10 "멤버 내보내기" 뒤에도 그 사람이 만든 요청·샘플 요청서 기록은 브랜드에 남는다(작성자 이름은 그대로). 맞는지.
5. 주소(slug) 승인 후 예전 주소로 들어오면 404다(브랜드 존재 숨김 원칙 D10과 같은 결). 옛 주소 → 새 주소 리다이렉트를 둘지? 기본값: 두지 않음(옛 slug가 다른 브랜드에 재사용될 수 있어 위험).
6. A-08 환율 저장 시 fxJob을 요청 안에서 동기로 돌린다(제안 2000건 상한). 운영 규모가 커지면 배치 큐로.
7. 설정 변경 권한은 ADMIN 전원(질문 1 기본값 그대로).

## 11단계 계획 (디자인 토큰 라운드 · 접근성 · 성능)
- **디자인 토큰 라운드**(PRD D19, Figma 04 Design Direction): `app/globals.css` 토큰(잉크·페이퍼·시그니처·경고·위험·라인·표면) 값만 교체되게 정리 — 화면 코드의 임의 색·간격(`text-[13px]` 등 반복 값)을 토큰/유틸로 모으는 목록 작성 후 교체. SUIT tabular 숫자(`.num`) 일괄 점검, 에디토리얼 그리드·큰 실물컷 규칙(라인시트 카드·제안 카드) 재확인. shadcn 기본 스타일 잔존 여부 grep.
- **접근성**: 폼 라벨 연결(aria-label만 있는 곳 → `<label>`), 포커스 링 토큰, 색 대비(warn·muted on paper), 키보드로 variant 매트릭스·체크 목록 조작, `lang="zh-CN"` 누락 점검(`/cn`·원문 병기), 상태 pill 텍스트 대체.
- **성능**: 라우트별 First Load JS 표(이번 A-08 99.7→3kB 같은 사례 찾기 — 클라이언트 컴포넌트가 zod·서버 상수를 끌고 오는지), 이미지 서명 URL 일괄 발급 확인, 목록 쿼리 N+1(브랜드 요청·제안·발주) 점검, `listUsersByRole` 호출 빈도(요청 단위 캐시·60초 모듈 캐시) 정리, `/cn` 오프라인 큐 재확인(외부 의존 0).
- 마감 → `docs/STEP11_NOTES.md`.
