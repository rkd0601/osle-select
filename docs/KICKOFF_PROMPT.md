# Claude Code 킥오프 프롬프트 (기획서 v1.0 기준)

준비: 새 저장소 루트에 `CLAUDE.md`, `docs/PRD.md`를 넣는다. 그 다음 아래를 첫 메시지로 붙여넣는다.

---

CLAUDE.md와 docs/PRD.md를 먼저 끝까지 읽어줘. 코드를 쓰기 전에 아래 순서대로 해줘.

1. PRD를 읽고 모호하거나 서로 충돌하는 부분, 구현 전에 내가 결정해야 하는 것을 질문 목록으로 정리해줘. 특히 다음 네 곳은 반드시 짚어줘.
   - "제안 = offer 1행" 구조에서 검수(product)와 발행(offer)을 분리한 서버 액션 설계, 재제안·추천 제안이 같은 액션을 쓰는 방식
   - RLS·뷰·권한 revoke 설계: 브랜드 역할이 products·product_costs·vendors 테이블에 접근할 수 없고 v_*_brand 뷰만 쓰는 구조, JWT app_metadata.role
   - 상태 전이 테이블과 owner_role·due_at(SLA) 계산을 한 곳에서 처리하는 방식, 발주 체인 순서 강제
   - 가격 함수: 녹인 마진·수수료·샘플 물류비·미회수 차감·선금 정산
   질문이 없으면 "없음"이라고 해도 돼.

2. PRD 13장 개발 순서의 1단계(셋업: 스키마·enum·RLS·뷰·권한 revoke·설정 시드·lib/config.ts)에 대한 구체적 작업 계획을 파일 단위로 제시해줘. 마이그레이션 파일 목록, 테이블·뷰·정책 이름, revoke 문, 시드 데이터 구성(ADMIN 1, CN 1, 원청 2, 브랜드 2 + owner/member, 요청 1, 상품 3)까지. 아직 코드는 쓰지 마.

3. 내가 계획을 승인하면 1단계를 구현해줘. 끝나면 다음을 SQL로 확인한 결과를 보여줘.
   - `pnpm supabase db reset`이 통과한다.
   - 브랜드 역할 세션으로 `products`, `product_costs`, `vendors` 직접 SELECT가 거부된다.
   - `v_products_brand`, `v_offers_brand`에 cost_cny·vendor_code·hidden_margin_rate·fx_rate·weight_g·*_zh 컬럼이 없다.
   - 브랜드 A 세션으로 브랜드 B의 offers·requests·orders가 0행이다.

작업 중 PRD에 없는 결정을 해야 하면 임의로 정하지 말고 선택지와 추천을 제시한 뒤 물어봐줘. 서비스명·도메인·상품 코드 접두어는 가칭이니 lib/config.ts 한 곳에 모아줘. PG·결제·세금계산서 자동 발행은 어떤 단계에서도 만들지 마.

---

## 이후 단계별 프롬프트 패턴

```
PRD 8장의 [화면 ID] 를 구현하자. 시작 전에:
- 관련 PRD 섹션(상태 enum·전이, 데이터 모델, 권한, 수용 기준)과 CLAUDE.md 절대 규칙을 다시 읽고
- 건드릴 파일 목록, 새 Server Action 시그니처, 추가되는 전이·SLA 규칙을 먼저 보여줘.
승인하면 구현하고, 끝나면 이 화면에 해당하는 수용 기준을 어떻게 검증했는지 알려줘.
```

권장 순서(PRD 13장): 인증·레이아웃·초대(P-02, P-03) → 요청(B-02, B-03, A-02, C-01) → 상품(C-02, C-03, C-04, 원청) → 검수·발행(번역, A-03, A-04, B-04, B-05) → 샘플(B-06, B-07, C-05, A-05) → 발주(B-08, A-06, B-09) → 소통·알림(comments, cn_questions, notify, 타임라인, A-01) → B-12, P-01, A-07 → 보안 E2E·현지 테스트.

## 공통 컴포넌트 먼저
화면 구현 전에 `components/domain/`의 8개(상태 pill, 핸드오프 카드, 타임라인, variant 매트릭스, 라인시트 카드, 금액 내역표, 원문/번역 병기, 입금 안내 카드)를 Figma 와이어프레임 기준으로 먼저 만든다. 프롬프트:

```
components/domain/ 에 PRD·기획서 12장의 공통 컴포넌트 8개를 만들자. 각 컴포넌트의 props 타입과 상태(로딩·빈·에러)를 먼저 제안하고, 승인 후 shadcn 기반으로 구현해줘. 도매 쇼핑몰식 상품 그리드는 만들지 마.
```
