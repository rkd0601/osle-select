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
- 스마트스토어 xlsx(질문 1), 쇼핑몰 실제 양식 헤더 대조(질문 5).
- P-01 채널톡 위젯(외부 스크립트 — 랜딩에만, `/cn` 제외)은 위젯 키 받은 뒤.
- E2E: 브랜드 세션 B-12 다운로드 내용 금지 키 스캔, A-07 승인 → 초대 수락 흐름.

### 질문 추가
5. 4개 쇼핑몰 일괄 등록 **헤더는 공개 자료 기준 초안**이다(`version: 2026-11-draft`). 각 쇼핑몰 관리자 화면의 최신 양식 파일을 받아 대조해야 한다 — 받으면 `lib/exports/{shop}.ts` 헤더만 고치고 버전을 올린다.
6. 사진은 WebP 그대로 넣는다. 일부 쇼핑몰이 JPG만 받으면 서버 변환(sharp 의존성)이 필요 — 허용?
7. 상품이 브랜드 뷰에서 사라지는 상태(`hidden` 등)가 되면 이미 발주한 상품도 패키지를 못 만든다(뷰 조건이 offering·repool·recheck). 발주 확정 상품은 상태와 무관하게 보이게 뷰를 넓힐지?
8. 신청 승인 시 slug는 관리자가 정한다(브랜드명에서 자동 제안). 브랜드가 정하게 할지?

## 독립 리뷰 (8·9단계, 919693f..236f1c4) — 반영 faf25ea · 0c5573f · 011d5c3
원가 누출·브랜드 교차·B-12 산출물 누출은 없었다(확인 목록: 후보·뷰·서명 경로 접두어·0036/0038/0039/0040·서비스 롤 범위).
| # | 심각도 | 내용 | 조치 |
|---|---|---|---|
| 1 | MED | `comments` insert 정책이 대상 소유를 보지 않아 CN이 남의 배정 항목에, 브랜드가 남의 발주에 코멘트를 직접 넣을 수 있었다(위아더 명의로 보임) | 0042: 세션 insert 정책 제거 + 권한 회수, 쓰기는 `addComment`만. SQL 31 |
| 2 | MED | `cnGateJob`이 읽은 뒤 관리자가 보류·답변한 질문도 노출 | 해제 update에 `held_by_admin=false`·`answered_at is null` 조건(배치·수동 노출 둘 다) |
| 3 | MED | `rebuildInvoice`가 감사 로그로 크레딧 사용을 추론 → 확정이 차감 뒤 로그 전에 죽거나 동시 재생성 시 이중 차감 | 0041 `use_brand_credit_for_order`(발주 행 잠금, `credit_used_krw` null일 때만 차감·기록), 확정·재생성 모두 이것으로. 기존 건은 감사 로그로 채움. SQL 30 |
| 4 | LOW | 즉시 알림: 보내는 중인 행을 크론이 다시 선점해 이중 발송 | 임대 `delivery_claimed_at`(2분), 실패 시 해제 |
| 5 | LOW | 번역 실패(body_ko null) 질문이 빈 문구로 노출 | 배치·수동 노출 모두 body_ko 필수 |
| 6 | LOW | digest 실패 무한 재시도·정렬 없음 | 3회 상한 + created_at 순 |
| 7 | LOW | 입금 신고 뒤에도 브랜드가 취소 가능 | 신고 뒤엔 위아더만(서버 가드 + 버튼) |
| 8 | LOW | 승인 후 초대 실패 시 승인 재시도 불가 | 승인은 성공으로 돌려주고 "상세에서 다시 초대" 안내. 크레딧 조정 이중 제출은 확인창·버튼 잠금으로 두고 멱등 키는 보류 |
| 9 | LOW | 브랜드 CN 질문 선택지 순서 미보장 → 다른 답 기록 | 0042 `with ordinality … order by`. SQL 31 |
| 10 | LOW | d805218 이전 본품 검품 결과에 중국어 컬러명이 있을 수 있음 | 미조치 — 운영 데이터가 아직 없다. 운영 전 데이터가 있으면 일회성 점검(질문 9) |

게이트: vitest 177 · tsc · eslint · build · SQL 31/31. 다음 마이그레이션 번호 0043.

### 질문 추가
9. 리뷰 10: 운영 DB에 d805218 이전 본품 검품 기록이 생기기 전이면 무시해도 되는지, 아니면 점검 SQL을 남길지.

---

## r7 반영과 마감 (2026-11-02)
커밋: 387f4fc(0045, Cowork) · f50a765(Cowork r7 코드) · 35c40ce(0043) · 125d2cb(0044) · d07a0f0(표준 패키지) · 9905fa5(r7 소항목)

- **Cowork r7 수용**: 0045 `brand_applications` anon 직접 insert 차단(SQL 32), CSV 수식 주입 방지, 패키지 사진 120장 상한·실패 기록·`maxDuration=60`, 신청 폼 honeypot 조용히·시간당 20건 넘으면 즉시 알림 생략·http(s) 채널만, A-07 `channels` 배열 방어. **DECISIONS r6 절이 r7 추가 때 지워져 있어 git에서 되살렸다**(r6 → r7 순서).
- **B-12 = 위아더 표준 패키지 v1**(DECISIONS 9-5, `docs/EXPORT_PACKAGE_SPEC.md`): `lib/exports/osle.ts` — `README.txt`(쇼핑몰별 대응표·사진 사용 범위·빠진 사진 목록) · `products.csv`(20컬럼 고정 순서) · `options.csv`(SKU 제안) · `sizes.csv`(실측) · `detail/{code}.html` · `images/{code}_{nn}.jpg`. zip 이름 `osle_package_{slug}_{YYYYMMDD}.zip`. 기존 4개 쇼핑몰 매핑은 `lib/exports/presets/`로 옮기고 B-12에서 "참고용(초안)" 체크박스로 zip 안 `presets/`에 더한다. `export_packages.shop_type = 'osle'`(0043).
- **사진**: `source='own'` + `usable_for_sales`만(r7-13) → `sharp` JPG 품질 90·긴 변 2000px·EXIF 회전(9-6, `lib/exports/images.ts`). 변환 실패 사진은 빼고 README 끝에 상품코드별 장수. 업로드 원본 WebP는 그대로.
- **발주 확정 스냅샷**(9-7): 0043 `export_snapshots`(발주서 × 상품 1행, 브랜드 뷰와 같은 컬럼 + 판매용 사진 경로) — `confirmOrder`·`rebuildInvoice`가 만든다(실패해도 확정 유지, 감사 `order.export_snapshot_error`). 0044 RLS: 브랜드 자기 것 읽기만(SQL 33). B-12는 **스냅샷 우선**, 없으면(0043 이전 확정 건·샘플 채택) 뷰. 뷰는 넓히지 않았다. 뷰 행·스냅샷 모두 `lib/exports/source.ts` 한 함수로 같은 모양.
- **r7 소항목**: 코멘트 알림 10분 묶기(8-9: 선점 때 같은 수신자·대상의 앞선 코멘트 알림이 10분 안에 있으면 외부 발송 없이 닫음, 인앱은 남음) · 정지 브랜드 멤버 SLA·digest 제외(r7-12, CN·위아더 건은 계속) · 위아더가 노출 전 답한 CN 질문 → 브랜드 요청 타임라인 "위아더가 중국 측 질문에 답했습니다" 1줄(8-10, 내용 없음) · A-07 조건 변경 폼에 "발행된 제안 N건은 기존 요율 유지"(r7-11) · 랜딩 h1·CTA, A-07 placeholder 2개, 상세 HTML 고정 문구 → i18n 키 · 초대 실패 안내에 브랜드 상세 경로.
- **스마트스토어 xlsx**: `docs/shop-templates/`에 양식 파일이 아직 없다 → CSV 유지(9-1·9-5). 양식이 들어오면 `exceljs`로.
- 게이트: vitest 185 · tsc · eslint · build · SQL 33/33. 다음 마이그레이션 번호 **0046**.

### 규격과 다르게 한 것 (Cowork 확인 요청)
10. `sizes.csv`에 **엉덩이(hip)** 열을 허리 뒤에 더했다 — 규격 v1 목록엔 없지만 하의 실측 템플릿(`MEASUREMENT_TEMPLATE.하의`)에 있어 빼면 데이터가 사라진다.
11. 사이즈 출처 라벨: 규격의 `원청 사이즈표`는 누출 검사 금지어 `원청`에 걸려 모든 패키지가 막힌다 → `제공 사이즈표`로. 문구는 i18n `export.pkg.sizeSource.vendor` 한 곳.
12. 금지어 스캔: 규격의 `margin|weight|fx` 부분 문자열은 상세 HTML 인라인 CSS(`margin:`·`font-weight`)와 겹쳐 → `margin_rate`·`weight_g`·`fx_rate`·`hidden_margin` 컬럼명 형태로, `cost`·`cny`·`vendor(s)`는 단어 경계로(대소문자 무시) 잡는다.
13. 표준 파일 컬럼 헤더(products·options·sizes)는 i18n 키가 아니라 `osle.ts` 상수 — 파일 규격(계약)이라 스냅샷 테스트로 고정한다. README·상세 HTML·공급 형태·예/아니오·출처 같은 값 문구는 키.
14. SKU 컬러 조각: 컬러에 영문 이름 칸이 없어 `lib/codes.ts COLOR_EN`(한국어 컬러명 → 영문 40여 개) → 영문 이름 그대로 → `C01` 순번. 사이즈는 영숫자 그대로 → `프리`=FREE → `S01`. 같은 SKU가 겹치면 `-2`.
15. 발주 확정 상품은 스냅샷이 우선이라, 확정 뒤 위아더가 상품 정보를 고쳐도 패키지엔 반영되지 않는다(9-7 문구 그대로). 고친 정보를 반영하려면 관리자 [청구 내역 다시 만들기](강제)로는 안 된다 — 스냅샷은 `ignoreDuplicates`. 필요하면 A-06에 "패키지 정보 다시 찍기" 버튼을 둘지?

## 9단계 마감
남은 것은 외부 입력 대기뿐: 쇼핑몰 양식 파일(9-5 Jay), 스마트스토어 xlsx(양식 뒤), 채널톡 위젯 키. B-12·A-07 E2E는 10단계 E2E 묶음에서. 질문 9(옛 검품 데이터)·10~15는 r8 답 대기.
