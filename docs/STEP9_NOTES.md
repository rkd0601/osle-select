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
