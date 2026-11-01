# 4단계 노트 — 상품 등록 (C-02 · C-03 · C-04 · 원청 A-08 일부)

Claude Code(개발) → Cowork(기획·검증). 기준: 기획서 v1.0.1 §6·§9(C-01~C-04)·§10 F2·F3, PRD 4·5·6장, CLAUDE.md.
이 문서는 **계획(착수 시)** → **한 일 / 안 한 일 / 질문(마감 시)** 순서로 갱신한다.

## 계획 (착수 2026-11-01)

### 데이터
- `0011_products_stage4.sql` (스키마): `products.source_request_item_id`(C-01 "상품 추가"로 들어온 항목 연결, A-04 발행 화면이 이 항목을 기본 선택), `products.verified_by`, 인덱스.
- `0012_products_writes.sql` (권한, 별도 커밋): `product_images/colors/sizes/variants`의 authenticated insert·update revoke, `vendors_cn_insert` 정책 삭제. 0008과 같은 모델 — CN 쓰기는 전부 서버 액션(역할·소유 검증 → 서비스 롤).
- Storage `product-images` 경로: `<actor_id>/<product_id>/<uuid>.webp`. 클라이언트가 상품 id를 먼저 만든다(오프라인 재전송 시 같은 id로 멱등 생성). `vendor-cards`: `<actor_id>/<uuid>.webp`.

### 순수 로직 (`lib/products.ts`, 테스트 필수)
- C-02 입력 스키마: 사진 ≥1, 원가 구간 ≥1(수량 오름차순·단가 단조 감소), 원청(기존 id 또는 신규 이름·시장·호수·명함).
- 원청 기본값 상속 `resolveInherited(product, vendor)`: 홀딩·라벨·수정·샘플 가능.
- 공개 조건 입력 `publishInput(...)` → 기존 `publishChecks`. **기획서 F3에 따라 컬러 ≥1·사이즈 ≥1·원가 구간 ≥1 추가**(PRD 4장 목록에 없음 → PRD 갱신).
- 재확인 판정 `needsRecheck(status, changed)`: 검수완료 이후 상태에서 원가·공급 형태·리드타임·MOQ가 바뀌면 `recheck`(PRD D16).
- variant 동기화: 컬러 × 사이즈.
- 코드 사전 `lib/codes.ts`: 소재·세탁·카테고리(ko/zh)·카테고리별 실측 부위·범위.

### 화면
- C-01 상세 "添加商品" → `/cn/products/new?item=<id>` (연결 자동, assigned면 sourcing 전이).
- **C-02** `/cn/products/new` 모바일 한 화면: 촬영(capture) → 실물 확인 자동, 원가 + 구간 추가, 최근 원청 1탭 / 신규 원청 + 명함 사진, 메모 → 暂存 → 다음 상품. **오프라인 큐(IndexedDB)**: 업로드·생성 실패 시 쌓고 online 이벤트에 재전송.
- **C-03** `/cn/products/[id]` PC: 사진(순서·종류·출처·판매 사용), 컬러·사이즈(실측 부위 템플릿), 소재 %·세탁·원산지, 원가 구간·공급 형태·리드타임·MOQ·최소 수량·중량, 원청 기본값 상속(예외만), 공개 조건 체크리스트 실시간, 提交审核(조건 미충족 시 비활성 + 서버 거부).
- **C-04** `/cn/products`: 상태 탭(임시저장/검수대기/반려/공개/재확인), 반려 사유(템플릿 zh), 빠른 수정 → C-03.
- **A-08(일부)** `/admin/vendors`: 원청 목록·생성·수정(기본 홀딩·샘플 가능·라벨 옵션·수정 옵션·메모·신뢰 점수 표시).

### 이번 단계에서 하지 않는 것 (계획 시점)
- 음성 메모 전사, 사이즈표·라벨 OCR, 컬러 사전 자동완성(→ 5단계 번역·용어 사전과 함께).
- A-03 검수·A-04 발행(5단계). 단, 검수 요청 상태 전이와 SLA는 이번에 연결.

---

## 마감 (2026-11-01) — 한 일

**Cowork 리뷰(REVIEW_2026-11-01) 수용**: 0010 + 리뷰 코드 변경을 게이트(vitest·tsc·eslint·build·PGlite 12/12) 통과 후 두 커밋(80fe288 db / cddf78a 코드)으로 반영. `tests/unit/requests.test.ts`는 Cowork 쪽 이전 사본으로 덮여 기존 케이스 15개가 빠져 있어 **병합 복원**했다(리뷰 케이스 3개 추가 유지).

**3단계 마무리 + 독립 리뷰 12건 수정** (236d923, 6812ef6, 21ab00d, 93000a2)
- 0013: 관리자 대행 시 `/b/{slug}` 요청 목록이 비고 상세가 404 → 브랜드 요청 뷰에 `is_admin() or`. SQL 검증 14.
- 액션 가드(`getActor`)도 `is_active=false`·정지 브랜드 차단(페이지 가드와 동일 판정), 재배정 상태 잠금 + `ownerAndDue`, `listUsers` 전 페이지(`lib/db/users.ts`), 핸드오프 키 `handoff.needs_info.*`, 보완 응답 링크 http(s)만(`HttpUrl` 공용), 보완 응답은 자료 저장 후 전이, `askBrand`는 배정·소싱 중에만, 대행 입력도 알림, `config.toml` 버킷(webp·5MiB), 하드코딩 문자열 제거, `/cn` 키 ko 병기.
- **`z.string().uuid()` → `z.guid()` 전수**: zod 4의 uuid()는 RFC 버전 비트를 검사해 시드 id(`10000000-0000-0000-…`)를 거부 → 시드 브랜드로 모든 액션이 `common.invalid`. 회귀 테스트(grep) 추가.
- A-02 중국어 저장 전 배정 버튼 비활성, `TRANSLATE_MODEL` 환경변수, Playwright 보안 E2E 뼈대(`tests/e2e/security.spec.ts`: A→B 404·slug 구분 불가, 브랜드 응답 금지 키, 브랜드 역할 /admin·/cn 404, CN_VENDOR 마스킹). `E2E_BASE_URL` 없으면 skip.

**4단계** (fc366ef, 4228344, 354910b, 6e39158)
- 0011 `products.source_request_item_id`·`verified_by`·인덱스 / 0012 `product_images/colors/sizes/variants` insert·update revoke, `vendors_cn_insert` 삭제. SQL 검증 13.
- `lib/codes.ts`(소재·세탁·원산지·카테고리 zh·실측 부위·범위), `lib/products.ts`(C-02/C-03 스키마, 원가 구간 단조 감소, 원청 상속, 공개 조건 입력, 재확인 판정, variant 동기화, Storage 경로). **공개 조건에 컬러≥1·사이즈≥1·원가 구간≥1·생산이면 리드타임·MOQ 추가**(기획서 F3, PRD 4장 갱신).
- C-02 `/cn/products/new`: 촬영(실물 확인 자동)·앨범, 원가 + 구간, 최근 원청 1탭/신규 원청 + 명함, 暂存 → 다음 상품. **IndexedDB 큐 먼저 저장 → 전송**, 실패 시 online 이벤트에 재전송, 올린 사진 경로를 entry에 기록해 재업로드 없음, 서버는 productId 기준 멱등. 요청 항목에서 들어오면 연결 + assigned→sourcing.
- C-03 `/cn/products/[id]`: 사진(종류·출처·판매 사용·컬러·순서·삭제·추가), 기본 정보·원청, 컬러·사이즈(카테고리별 실측 템플릿, 범위 체크), 혼용률 코드·합계·원산지·세탁, 원가 구간·공급·중량·샘플, 원청 상속(홀딩·라벨·수정은 "이 상품만 예외" 토글), 공개 조건 체크리스트(서버 계산) + 提交审核(서버 재검사). 공개 상품의 가격·공급 변경 → recheck + 감사 로그 `price.cost_update`.
- C-04 `/cn/products`: 상태 탭, 반려 사유(settings.rejection_templates zh/ko), 재확인 사유.
- A-08(일부) `/admin/vendors`: 원청 목록·생성·기본값 수정(감사 로그 `vendor.defaults_update`). 관리자 내비 i18n.
- 번들: 업로드를 supabase-js → `lib/storage-upload.ts`(fetch PUT)로 바꿔 `/cn/products/new` 201→132KB, `/cn/products/[id]` 204→136KB, 브랜드 요청 화면 195→131KB. 회귀 테스트(브라우저 클라이언트 import 금지).
- 테스트: vitest 80(+i18n 키 스캐너: 코드의 리터럴 키가 ko에, /cn 키가 zh에 있는지), PGlite SQL 14/14.

## 안 한 일

- 실제 Supabase 연결·화면 확인·E2E 실행(프로젝트·키 없음). `lib/storage-upload.ts`의 fetch 업로드는 storage-js `uploadToSignedUrl`과 같은 엔드포인트·헤더로 맞췄지만 **실서버 미검증** — 연결되면 첫 확인 대상.
- 오프라인 큐 단위 테스트(Node에 IndexedDB 없음, fake-indexeddb 미도입). 수동 시나리오: 비행기 모드로 暂存 → 대기 n건 → 연결 → 자동 업로드.
- 음성 메모 전사, 사이즈표·라벨 OCR, 컬러 사전 자동완성, AI 키워드(ai_tags) — 5단계 번역·용어 사전과 함께.
- 제안·상품 브랜드 뷰(v_offers_brand 등)의 관리자 대행 노출 — 5단계 B-04 착수 때 0013과 같은 방식.
- 원청 중복 감지(같은 시장·호수), 원청 신뢰 점수 계산(검품 누적) — 7단계 검품 이후.

## 질문 (기획 확인 필요)

1. **B-02 항목 분할**: 기획서 F1은 "항목 분할은 브랜드가 하지 않는다"인데, 지금은 브랜드가 선택적으로 "+ 항목 추가"를 할 수 있다(기본 1개). 버튼을 없앨까, 남길까? (추천: 남김 — 여러 스타일을 한 번에 올리는 인플루언서가 많고, 관리자가 다시 정리 가능)
2. **예상 수량 "구간 선택"**(F1): 지금 자유 입력. 구간 값을 정해 주면 select로 바꾼다. (예: ~30 / 30~100 / 100~300 / 300+)
3. **희망 납기 경고**(F1: 오늘 + 최소 리드타임보다 빠르면 경고): settings에 `min_lead_days` 키가 없다. 추가할까? 기본값은?
4. **실물 확인 자동 체크**(C-02): 브라우저는 "카메라로 찍었는지"를 증명할 수 없다(`capture` 속성은 힌트). 지금은 촬영 버튼으로 찍으면 자기 신고 + `verified_by/at` 기록. GPS·EXIF 시각 검사까지 할까? (추천: MVP는 자기 신고 + A-03에서 관리자 확인)
5. **CN이 원청을 직접 생성**: C-02에서 CN_SOURCER·CN_VENDOR 모두 새 원청을 만들 수 있다. CN_VENDOR(2차, 원청 본인)는 원청 생성을 막고 자기 원청에 고정할까?
6. **재확인 트리거 필드**: 원가 구간·공급 형태·리드타임·생산 MOQ·최소 수량·홀딩·원청 변경. 라벨·수정 옵션 단가 변경도 재확인 대상에 넣을까? (지금은 아님)
7. **협업 방식**: Cowork가 이전 사본으로 파일을 덮으면 개발 쪽 최신 변경이 사라질 수 있다(이번에 테스트 파일 1건). Cowork 쪽에서 작업 전 `git pull`/`git status` 확인, 또는 `review/*` 브랜치에 커밋해 주면 개발이 병합하는 방식을 제안.
