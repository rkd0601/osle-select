# 15단계 노트 — 디자인 v2 "라인시트" 구현 (2026-11-04)

Claude Code(개발) → Cowork(기획·검증). 기준: `docs/CLAUDE_CODE_NEXT.md` §0-c, `docs/DESIGN_SPEC_v2.md`, `docs/design/prototype_v2.html`, DECISIONS d-1~d-5. 스펙 §7 순서대로 단계마다 게이트 후 커밋.

## 한 것

| 단계 | 커밋 | 내용 |
|---|---|---|
| 0 | b032b5c | Cowork 스펙·프로토타입·DECISIONS d-1~d-5·NEXT §0-c 수용 |
| 1 토큰 | 2bf67c7 | §2 값 교체(paper `#f2f1ec`·ink `#14161f`·네이비·금박·ok·radius 0·카드 그림자 없음), 타입 17유틸 → 8단계 값, 굵기 상한 500(`font-semibold/bold`도 500), `rounded-*` 0, 다크 토큰 준비. 프로토타입 컴포넌트 CSS 이식, `.field` 래퍼/입력 겸용, 1차 패스 이름 호환 |
| 2 뼈대 | f307bbc | 브랜드 바(모노그램·워드마크·브랜드명 룰·1px 밑줄·640 미만 가로 메뉴), 관리자 232px ink 사이드바(금색 1px 활성), 중국 56px ink 바·본문 760, 로그인·랜딩 v2. domain: `StatusDot`(StatusPill 별칭), `HandoffCard` 재작성, `IndexRow`, `Figure`·`KpiRow`, `InvoiceSheet`, `Photo`, `Monogram`/`Mark`, `PageHeader`·`FilterTabs`·`EmptyState`·`NavLink` v2 |
| 3 브랜드 | c862512 | B-01(통계 타일·인사말 삭제, "지금 결정할 일 n" → 내 차례 → 진행 중 행, 오른쪽 Figure 3) · B-04(요청별 라인시트 3칸) · B-08/샘플/요청 상세 공통 뼈대(제목 `{첫 상품명} 외 n · {수량}장`, 눈썹 `#id 4자`, 오른쪽 InvoiceSheet) · B-02(760 단일 칸·바닥 요약 바) · 목록 IndexRow · 설정·내보내기. 공통 컴포넌트(timeline·comment·linesheet·price·payment·variant·option·notification·image-picker) v2. 공개 화면(신청·초대) v2 |
| 4 관리자·중국 | d8aa1d2 | A-01(날짜 눈썹·"할 일 n · 지연 m"·큐 표·KPI 룰 사이), 나머지 관리자 화면 카드 → 룰·`.tbl`·`.st`·InvoiceSheet. C-05 프로토타입 구조, `/cn` 760 단일 칸. `StatGrid` 삭제 |
| 5 문구 | 0b6ba2b | §6 간결한 해요체 전수 — ko 137 · ko.admin 10 · cn 7 · zh 42키. 키 추가·삭제 없음, 플레이스홀더 전수 대조 |

- 데이터 읽기(브랜드): 제목용 상품명은 `lib/db/brand/titles.ts`가 `v_offers_brand`·`v_products_brand`만 읽는다(규칙 1). 관리자 큐 표시 필드(ref·name·more·qty·assignee)는 가격 필드 없음.
- 보안 테스트 중 발견: 스펙 클래스 `.tiers`가 E2E 금지 키 `"tiers"`(원가 JSON)와 같은 글자라 브랜드 제안 화면에서 오탐 → 테스트는 그대로 두고 클래스를 `.price-tiers`로. 실제 누출 없음(브랜드 7화면 재확인).
- globals 보정: h1~h3·b 굵기를 `@layer base`로(`.display` 300이 이기게), 파일 없는 Noto Sans SC `@font-face` 제거(중국어가 있는 모든 화면에서 404가 났다 — 파일을 넣으면 되살린다), 탭 행 세로 스크롤바 제거.
- 개발 DB: 브랜드 주소 교정 뒤 남은 알림 링크 16건 `/b/osle-muz/…` → `/b/osle/…`.
- E2E 브랜드 격리 스펙 60초(로컬 dev 첫 컴파일로 15화면 30초 초과).

## 순회 결과 (dev 서버 + 클라우드 개발 DB, 390px, 상태 바꾸는 버튼 누르지 않음)

| 역할 | 화면 | 오류·비200 | 금지 키 | 가로 넘침 |
|---|---|---|---|---|
| 브랜드 A 대표 | 22 | 0 (옛 주소 알림 링크 3 → 데이터 교정) | 0 | 0 |
| 위아더 관리자 | 38 | 0 | — | 35화면 (사이드바 232px 고정 — DECISIONS u-13 PC 전제, 의도) |
| 중국 소싱 담당 | 12 | 0 | — | 0 |
| 원청 사장 | 8 | 0 | 브랜드명·목표가 0 (E2E) | 0 |

게이트: vitest 231 · tsc · eslint · build(First Load 공통 129kB) · SQL 39/39 + 사전 점검 · **E2E 9/9**. 금지 패턴 검사: 둥근 모서리 0(점·색 칩의 `rounded-full`만), 카드 그림자 0, 화면 텍스트 화살표 0.

## 안 한 것
- 관리자 사이드바 메뉴 오른쪽 건수(§3) — 알림만. 메뉴별 건수는 쿼리 추가가 필요해 다음에.
- 샘플·발주 **작성 폼**과 상품 상세(`offers/[id]`)는 가벼운 수정만(입력 블록이라 상자 허용 범위), 구조 재작성 안 함.
- 미사용 i18n 키 정리(목록은 아래) — 동적 키(`status.order.${s}`) 때문에 지우지 않고 남김.
- 다크 테마 전환 UI(토큰만 준비, 서비스는 라이트 고정).
- Noto Sans SC 파일(셀프호스팅 서브셋) — 아직 없음, 중국어는 기기 글꼴.

## 질문 (보수적 기본값으로 진행)
1. `request.addItem`: 스펙 §5는 "+ 항목 추가", 문구 정리에서 기호를 빼려다 스펙대로 "+ 항목 추가" 유지. 기본값: 스펙대로.
2. 상태명 6자 두 개 — `status.order.quoted` "수량 확정 대기", `qty_confirmed` "최종 견적 준비". 5자로 줄이면 뜻이 흐려져 유지. 기본값: 유지.
3. KPI 라벨 "제안 → 관심"의 화살표 — 프로토타입 표기라 유지. 기본값: 유지.
4. 관리자 390px — PC 전제(u-13) 유지. 기본값: 유지.

### 미사용으로 보이는 키 (지우지 않음)
- ko.json: `home.yourTurn`·`home.empty`·`home.greeting*`·`home.stat.*`·`home.sortedByDue`·`home.inProgressHelp`·`home.quick`·`home.nothingToDecide`·`common.none`·`common.ok`·`request.list.items/lead/emptyHelp`·`request.detail.links/summary/sumItems`·`timeline.transition/comment`·`price.compact`·`detail.addToSample`·`payment.notice.title/what/ifLate`·`payment.deposit.*`·`comments.cn`·`order.list.lead/leadTotal/emptyHelp/delivery`·`sample.list.lead/emptyHelp`·`bsettings.lead`·`linesheet.emptyHelp/requestEyebrow/toRequest`·`list.mine`·`list.emptyFilteredHelp`·`list.col.*`
- ko.admin.json: `admin.title`·`admin.queue`·`admin.request.gate/edit`·`admin.vendors.products`·`admin.samples.productTotal`·`admin.orders.depositNote`·`admin.queue.overdue/applications/slugRequests`·`admin.brands.noApplications`·`audit.lead/count`·`admin.ui.filtered.help`·`admin.dash.lead/pending/applications/slugRequests/pendingHint/emptyHelp`·`admin.offers.historyCount`·`admin.samples.nowAt`·`admin.*.lead/.emptyHelp`
- ko.cn.json: `cn.order.gbClose`·`cn.home.desc`·`cn.home.stat.*`·`cn.*.empty.help`·`cn.products.desc`·`cn.tasks.desc`·`cn.notif.empty.help`

다음 마이그레이션 번호 **0054**(이번 단계 마이그레이션 없음).
