# 9단계 노트 — B-12 쇼핑몰 상품 패키지 (+ P-01 랜딩·신청, A-07 브랜드 관리)

Claude Code(개발) → Cowork(기획·검증). 기준: PRD D3·10장·12장 수용 기준("B-12가 4개 쇼핑몰 양식의 엑셀과 이미지 zip을 생성한다"), CLAUDE.md 절대 규칙 1·2·9, CLAUDE_CODE_NEXT r6 §2.

## 계획 (착수 2026-11-02)

### 원칙
- **입력**: 발주 확정(confirmed 이후) 상품 또는 샘플 채택(피드백 interested) 상품 + 쇼핑몰 타입(cafe24|godo|imweb|smartstore).
- **데이터는 브랜드 뷰 컬럼만**: `v_products_brand`·`v_offers_brand`·컬러/사이즈 뷰 — 원가·원청·중량·`*_zh`·`hidden_margin_rate`·`fx_rate`가 타입 단계에서 못 들어오게 `ExportProduct` 입력 타입을 고정(번역 입력처럼 `AssertNoForbidden`). 가격은 제안 고정 공급가(`offers` tier)만 — 판매가는 브랜드가 정한다(빈 칸 + 권장 배수 안내 없음).
- **매핑은 `lib/exports/{shop}.ts`**: 쇼핑몰 양식 컬럼 순서·헤더·값 변환을 순수 함수로, `version` 상수로 관리(양식 변경 대비). 공통 `lib/exports/common.ts`(상세 HTML: 혼용률·사이즈표·세탁·원산지 자동 삽입, 옵션 문자열 컬러×사이즈).
- **이미지 zip**: `usable_for_sales=true` 사진만(참고 이미지·원청 사진 제외), 순서(sort_order), 파일명 `{code}_{nn}.jpg`, 리사이즈는 업로드 때 2000px WebP라 그대로 + 쇼핑몰별 권장 크기 메모. 비공개 버킷 → 서버에서 서명 URL로 읽어 zip.
- **생성은 서버 액션 + Route Handler 다운로드**: `export_packages` 행(brand_id, product_ids, shop_type, files, status) → 파일은 Storage `exports/{brand}/{id}/` 비공개, 다운로드는 서명 URL(짧게). 엑셀은 CSV(UTF-8 BOM) 우선 — 카페24·고도몰·아임웹은 CSV 업로드 지원, 스마트스토어는 xlsx 양식이라 xlsx 라이브러리 필요 여부 확인(질문 1).
- `/cn` 무관. 외부 CDN 없음.

### 화면
- **B-12** `/b/{slug}/exports`: 대상 상품 목록(발주 확정·샘플 채택, 브랜드 뷰) 체크 → 쇼핑몰 선택 → [패키지 만들기] → 최근 패키지 목록(다운로드: 엑셀/CSV · 이미지 zip · 상세 HTML). 원가 없는 것만 보인다.
- 상품 상세(B-05)·발주 상세에 "쇼핑몰로 보내기" 진입.

### 테스트
- `lib/exports/*` 매핑 단위 테스트: 4개 쇼핑몰 헤더·행, 옵션 조합, 상세 HTML(혼용률·사이즈표 삽입, 이스케이프).
- **금지 키 스캔**: 생성된 CSV·HTML 문자열에 `cost`·`cny`·`vendor`·`weight`·`margin`·`fx` 및 중국어(한자 범위) 없음.
- SQL: `export_packages` 브랜드 격리(타 브랜드 0행), 쓰기는 서비스 롤만.
- E2E는 Playwright 묶음 때 브랜드 세션으로 B-12 다운로드 내용 스캔.

### 질문 (보수적 기본값으로 진행)
1. 스마트스토어 일괄 등록은 xlsx 양식 — 의존성(`exceljs` 등) 추가 허용? 기본값: 4개 모두 CSV(UTF-8 BOM)로 시작, 스마트스토어 xlsx는 확인 뒤.
2. 대상 = 발주 확정 + 샘플 채택(피드백 interested) 둘 다? PRD 10장 그대로 둘 다로 진행.
3. 판매가 칸: 비워 두고 공급가만 참고 칸에? 기본값: 판매가 빈 칸, 공급가는 패키지 요약에만(엑셀에는 넣지 않음 — 쇼핑몰에 공급가가 올라가는 사고 방지).
4. P-01 랜딩·신청, A-07 브랜드 관리는 PRD 9단계 묶음 — B-12 다음 순서로.

---

## 진행 (2026-11-02)
커밋: fb4fc67(lib/exports 매핑) · 5d71f8a(0039) · 29e82f2(B-12 화면) · 236f1c4(A-07·P-01)

- **매핑** `lib/exports/{cafe24,godo,imweb,smartstore}.ts` + `common.ts`: 쇼핑몰별 헤더·행(버전 상수 `2026-11-draft`), 옵션 문자열(카페24 조합형 `색상{…}//사이즈{…}`, 고도몰 variant `^|^`·`@`, 아임웹 `색상:…/사이즈:…`, 스마트스토어 조합형 줄바꿈), 상세 HTML(혼용률·컬러·사이즈·세탁·원산지 표 + 실측 사이즈표, 이스케이프), CSV(UTF-8 BOM·CRLF·RFC 4180), **판매가 빈 칸**. `ExportProduct` 타입에 원가·원청·중량·zh·수수료 키가 들어오면 컴파일 오류. 산출물 누출 검사(`leaks`: 원가 키워드·원청·마진·한자) — 걸리면 생성 중단 + `export.leak_blocked` 감사.
- **zip**: 의존성 없는 무압축(store) 작성기(`lib/exports/zip.ts`, CRC32, UTF-8 파일명). zip 안: `{shop}_products.csv` · `detail/{code}.html` · `images/{code}_{nn}.webp`.
- **B-12** `/b/{slug}/exports`: 후보 = 발주 확정 라인(qty>0) + 샘플 관심, **브랜드 뷰만**(`lib/db/brand/exports.ts`). 판매 가능 사진(`usable_for_sales`)만. 생성 → `exports/{brand}/{package}/` 비공개 버킷 → `export_packages`(building → ready|failed). 다운로드는 **자기 브랜드 접두어 경로만** 서명(행의 files를 그대로 믿지 않음). 발주 상세에서 진입 링크. 감사 `export.create`.
- **0039**: `export_packages` 정책이 `for all`이라 브랜드 세션이 임의 경로가 든 행을 직접 만들 수 있었다 → 읽기만 + 쓰기 권한 회수 + SQL 29.
- **A-07** `/admin/brands`: 대기 신청 승인(신청 선점 → 브랜드 생성 → owner 초대 + 메일; slug 중복이면 신청 되돌림)·반려, 브랜드 목록(등급·수수료·숨은 마진·크레딧·멤버). 상세: 조건 변경(감사 `brand.terms_update` before/after — 절대 규칙 12, 발행된 제안은 고정이라 영향 없음), 크레딧 ±조정(원자 RPC, 차감은 잔액까지, 감사 요청액·실제액), 정지·재개, 멤버 초대.
- **P-01**: 랜딩 소개 3블록(찾아서·확인하고·책임져요) + `/apply` 신청 폼(채널 링크 1~2, 팔로워 규모, 연락처, 통신판매업, 중국 콘텐츠 동의 `cn_content_optin`, honeypot, 같은 이메일 대기 신청 중복 방지) → `brand.applied` 관리자 즉시 알림.
- **초대 메일** `notifyInvite`(lib/notify.ts — 받는 사람이 아직 프로필·역할이 없어 알림 행 대신 이 모듈에서만 직접). 키가 없으면 화면에 링크.
- 게이트: vitest 177 · tsc · eslint · build · SQL 29/29.

## 남은 일 (9단계)
- 독립 리뷰(진행 중) 반영.
- 스마트스토어 xlsx(질문 1), 쇼핑몰 실제 양식 헤더 대조(질문 5).
- P-01 채널톡 위젯(외부 스크립트 — 랜딩에만, `/cn` 제외)은 위젯 키 받은 뒤.
- E2E: 브랜드 세션 B-12 다운로드 내용 금지 키 스캔, A-07 승인 → 초대 수락 흐름.

### 질문 추가
5. 4개 쇼핑몰 일괄 등록 **헤더는 공개 자료 기준 초안**이다(`version: 2026-11-draft`). 각 쇼핑몰 관리자 화면의 최신 양식 파일을 받아 대조해야 한다 — 받으면 `lib/exports/{shop}.ts` 헤더만 고치고 버전을 올린다.
6. 사진은 WebP 그대로 넣는다. 일부 쇼핑몰이 JPG만 받으면 서버 변환(sharp 의존성)이 필요 — 허용?
7. 상품이 브랜드 뷰에서 사라지는 상태(`hidden` 등)가 되면 이미 발주한 상품도 패키지를 못 만든다(뷰 조건이 offering·repool·recheck). 발주 확정 상품은 상태와 무관하게 보이게 뷰를 넓힐지?
8. 신청 승인 시 slug는 관리자가 정한다(브랜드명에서 자동 제안). 브랜드가 정하게 할지?
