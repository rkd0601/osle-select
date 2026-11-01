# Claude Code에 붙여넣을 다음 메시지 (feat/B-02-request 브랜치에서)

```
Cowork 리뷰가 feat/B-02-request 위에 27개 파일을 덮어썼다. 먼저 docs/REVIEW_2026-11-01.md 를 읽고, 아래 순서로 진행해줘.

1. 수용·검증
   - git status 로 변경 파일 확인 → pnpm test (26 passed) → pnpm exec tsc --noEmit → pnpm lint → pnpm build → pnpm db:check (12/12 PASS; Docker 없으면 db:check:lite).
   - 두 커밋으로 나눠 커밋: (a) `fix(db): 0010 리뷰 반영 — 컬럼 grant·CN 직접 접근 차단·활성 제안 unique·뷰 필터·인덱스` (0010, seed, shim, checks, run script) (b) `fix(review): Actor canPurchase 전이, supplyRequestInfo received, ceil10, 초대 강등 제거, /home 루프, is_active/brand status` (나머지).
   - lib/db/transition.ts 의 applyTransition 에 canPurchase 가 생겼다. 브랜드 쪽 액션은 requireBrandAccess().canPurchase 를 넘겨라(이미 app/b/[slug]/requests/actions.ts 에 적용됨). 앞으로 샘플 요청서·발주서 액션도 동일.

2. 3단계 마무리 (B-02·B-03·A-02·C-01)
   - app/cn/items/[id]/page.tsx 와 item-actions.tsx 가 막 생겼다: startSourcing / askBrand 버튼이 전이 테이블(allowedNext)에 따라만 보이는지, zh-CN 문자열이 전부 lib/i18n/zh-CN.json 키인지 확인.
   - A-02 항목 패널: 배정 시 description_zh 비어 있으면 서버가 거부(request.error.needZh)하므로 UI도 번역 초안(suggestTranslation) → 확인 → 저장 흐름을 먼저 요구하게.
   - B-03: needs_info 항목에 "보완하기" 폼(supplyRequestInfo) + 핸드오프 카드(components/domain/handoff-card.tsx)로 "지금 누구 차례·언제까지"가 첫 화면에 보이게.
   - 수용 기준(E2E 뼈대, Playwright 설치): 브랜드 A 세션으로 /b/brand-b/** 전부 404, /b/osle-muz/requests/[id] 응답 본문에 `_zh`·`assigned_to`·`cost`·`fx_rate` 문자열 없음, CN_VENDOR 세션 /cn 에 target_price·브랜드명 없음.

3. 4단계 기획 선반영 (코드 쓰기 전에 docs/PRD.md 와 대조만)
   - C-02/C-03 상품 등록(원청 기본값 상속, 사진 5장+실물컷, 공개 조건 publishChecks), A-03 검수(review) 와 A-04 제안 발행(issue) 은 별도 서버 액션. 발행 시 buildPriceTiers 결과·fee_rate·hidden_margin_rate·fx_rate·valid_until·exclusive_until 을 offers 1행에 고정.
   - 마이그레이션은 0011부터. RLS·뷰·권한 변경은 항상 별도 커밋.
   - 끝나면 docs/REVIEW 처럼 docs/STEP4_NOTES.md 에 "한 일 / 안 한 일 / 질문"을 적어줘. Cowork가 그걸 읽고 다음 리뷰를 돈다.
```
