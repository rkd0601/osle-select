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
