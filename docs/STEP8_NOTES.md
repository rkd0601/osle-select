# 8단계 노트 — 소통·알림 (A-01 · 알림 채널 · 배치 · 코멘트 · 타임라인)

Claude Code(개발) → Cowork(기획·검증). 기준: PRD D17·9장·12장 수용 기준(알림 다이제스트·A-01 큐·KPI), 기획서 §11 핸드오프 표, CLAUDE_CODE_NEXT r4 §2, CLAUDE.md 코딩 규칙 "알림은 `notify(event)` 한 곳".

## 계획 (착수 2026-11-01)

### 원칙
- 채널 결정은 **`lib/notify.ts#notify()` 한 곳**. 이벤트 → 수신자·kind(instant|digest)·채널. 화면·액션은 이메일·WeCom을 직접 부르지 않는다.
- 브랜드: 인앱 + 이메일(Resend, React Email ko). ADMIN: 인앱 + 이메일. CN: 인앱 + **WeCom 그룹 봇 webhook**(담당자명 + 딥링크, zh). 알림톡은 2차.
- instant = 공이 넘어옴·기한 초과·예상 제안일 초과·재확인으로 가려짐. digest = 진행 상황, 수신자별 1일 1회(항목 단위 묶음 — "제안 7개 발행 → 1통", 12장 수용 기준).
- 외부 호출 실패는 알림 행에 기록하고 재시도(배치). 서버 액션의 성공 여부와 분리(알림 실패로 상태 전이를 되돌리지 않는다).
- `/cn` 화면은 외부 의존 금지(규칙 9) — WeCom은 서버에서만 호출.

### 데이터 (0033 스키마 / 0034 뷰·권한)
- `notifications`: `email_sent_at`, `wecom_sent_at`, `delivery_error text`, `attempts int` (기존 `sent_at`·`channel`은 인앱 기준 유지). 인덱스 (recipient_id, read_at), (kind, email_sent_at).
- `profiles.notify_email boolean default true`(수신 거부는 digest만 — instant는 끌 수 없음, 질문 2), `profiles.wecom_name text`(그룹 봇 멘션용 담당자명).
- 본인 알림만 읽기·읽음 표시: RLS select/update(read_at만) — 쓰기 컬럼 grant 최소화.

### 배치 (Vercel cron → `app/api/cron/[job]/route.ts`, `CRON_SECRET` 헤더 검사, 전부 `notify()` 경유)
| job | 주기 | 내용 |
|---|---|---|
| `deliver` | 5분 | instant 미발송(email/wecom) 재시도, 3회 실패 시 ADMIN 인앱 |
| `digest` | 매일 09:00 KST | 수신자별 digest 묶어 이메일 1통(ko) / CN은 WeCom 1메시지(zh) |
| `sla` | 30분 | `due_at` 경과 객체 → owner_role에게 instant "기한 초과"(객체당 1회, 재알림 24h) |
| `offers` | 매일 00:10 KST | `valid_until` 경과 제안 → expired(전이표) + 브랜드 digest |
| `fx` | 설정 변경 시 + 매일 | 발행 시 `fx_rate` 대비 현재 설정 환율 ±3% 이상인 활성 제안 → recheck(관리자 큐, 브랜드에는 "재확인 중") — 외부 환율 API는 쓰지 않음(질문 3) |
| `samples` | 매일 | 피드백·회수 기한 경과 → 관리자 instant(청구는 수동 유지), 브랜드 리마인드 digest |
| `cn_gate` | 15분 | `cn_questions.admin_gate_until` 경과·보류 아님 → `released_at` + 브랜드 instant |

### 화면·컴포넌트
- **A-01** `/admin`: 지연 순 큐(owner_role=ADMIN인 모든 객체 — 요청 항목·상품 검수·제안 재확인·샘플·발주 — `due_at` 오름차순, 초과 강조) + **KPI 보드**(정보 일치율 평균·추이, 제안 → 관심 전환율, 샘플 → 발주 전환율, SLA 준수율, 미회수 건수).
- 알림 목록·읽음: `/b/{slug}/notifications`, `/admin/notifications`, `/cn/notifications`(zh) + 헤더 배지(미읽음 수).
- **통합 코멘트** `components/domain/comment-thread.tsx`: 대상(요청·항목·제안·샘플·발주·라인), 가시성 brand/internal/cn, ko↔zh 자동 번역(glossary, 원가 필드 없음), 원문/번역 병기. 서버 액션 `addComment` → notify.
- **CN 질문 게이트**(A-02): 관리자 4시간 안에 보류/답변/수정 가능, 경과 시 자동 노출(배치).
- **타임라인**: `audit_logs`(transition·돈 행위)를 객체별로 — 기존 `Timeline` 컴포넌트에 연결(요청·샘플·발주 상세).
- **핸드오프 카드** `components/domain/handoff-card.tsx`: 담당자·기한·결정할 것·정보·CTA (기획서 §11 14건 이벤트 정의를 템플릿 키로).

### 이메일 (`emails/`, React Email)
- `instant.tsx`(제목 + 한 줄 + CTA 딥링크), `digest.tsx`(객체별 묶음 목록), ko/zh 문구는 i18n 키(규칙 10). 발신 주소·도메인은 `lib/config.ts` 상수(가칭 교체 지점).
- 금액·원가는 메일 본문에 넣지 않는다(링크로 들어가 보게) — 원가 비노출 이중 방어.

### 테스트
- `notify` 라우팅 단위 테스트: 이벤트별 수신자 역할·kind·채널 표(전수), 브랜드 이벤트에 CN 수신자 없음.
- digest 묶음(같은 수신자·같은 날·같은 객체 → 1항목), SLA 재알림 간격, fx ±3% 판정, cn_gate 해제 조건.
- SQL: 알림 RLS(타인 알림 0건, read_at 외 update 불가).

### 질문 (보수적 기본값으로 진행)
1. Resend 발신 도메인·주소 미정 → `lib/config.ts`에 `noreply@{도메인}` 자리표시, 키 없으면 이메일 건너뛰고 인앱만(로그).
2. 수신 거부: digest만 끌 수 있게, instant(공이 넘어옴)는 항상. 맞나?
3. 환율 ±3% 재확인: 외부 API 없이 **관리자가 설정 환율을 바꿀 때**와 매일 배치에서 발행 fx 대비 비교. 외부 시세 연동이 필요하면 별도 결정.
4. WeCom: 그룹 봇 1개(`WECOM_WEBHOOK_URL`)에 담당자명 멘션 + 딥링크. 원청(CN_VENDOR)별 그룹이 필요하면 vendors에 webhook 컬럼 추가.
5. digest 발송 시각 09:00 KST(브랜드·ADMIN), CN도 09:00 CST(=10:00 KST)로 할지?

---

## 진행 (2026-11-01)
커밋: 2618ec0(0033) · 0f93d0a(0034, 권한 + SQL 23) · 15cb166(채널) · dce6ffe(배치) · 19844a6(A-01·알림 목록)

- **0033/0034**: 알림 발송 기록(email/wecom/digest 시각·시도·오류)·묶음 키(entity)·수신 설정(`notify_digest`)·`sla_alerts`. 사용자는 본인 알림의 `read_at`만 수정, 생성 불가, 발송 기록 컬럼 비공개(SQL 23). 0005가 notifications에 insert/update 전체를 주던 것을 좁혔다.
- **채널**: `notify()` → 인앱 행 + instant는 응답 뒤 즉시(`after`) 발송, 5분 `deliver` 배치가 3회 재시도. 채널 결정은 `lib/digest#channelFor` 한 곳(CN = WeCom 그룹 봇 + 담당자명·딥링크, 브랜드·ADMIN = Resend 이메일). 키 없으면 건너뛰고 인앱만. 메일·WeCom에 금액·원가 없음(제목 템플릿 + 링크).
- **digest**: 09:00 KST 수신자별 1통, 같은 대상(entity·entity_id)은 한 줄 + 건수 — "제안 7개 발행 → 1통"(테스트).
- **배치** (`/api/cron/[job]`, `CRON_SECRET`): `sla`(기한 초과 1회, CN 담당 지연은 위아더에게) · `offers`(유효기간 경과 → expired) · `fx`(발행 환율 대비 ±3% → 상품 recheck, 재승인 때 현재 환율) · `samples`(피드백·회수 기한 경과 → 관리자) · `cn_gate`(4시간 게이트 해제 → 브랜드). 상태 변경은 전부 `applyTransition`(시스템 행위자 `actorId=null`, 감사 로그 남음). 판정은 `lib/cron-rules` + 테스트.
- **A-01**: KPI 보드(최근 90일 — 정보 일치율 평균·본품 검품 수, 제안→관심, 샘플 관심→발주, 발주 기한 초과, 미회수 청구) + 지연 순 큐(위아더 + 중국 담당). `lib/kpi` + 테스트.
- **알림 목록**: `/b/{slug}/notifications`·`/admin/notifications`·`/cn/notifications`(zh) + 미읽음 배지 + 모두 읽음.
- 게이트: vitest 151 · tsc · eslint · build · SQL 24/24.

## 마감 (2026-11-02)

### Cowork r5·r6 수용
커밋 7c6b379(0040 brands 컬럼 grant) · b18ce23(크론 전부 스케줄·즉시 알림 선점·digest 재시도·instant 등급·reportDeposit 가드·SLA 정렬·크레딧 RPC 실패·환불 예정·확보 미달=short·리오더 qty>0·수정 MOQ 재검사). 게이트 통과 확인 후 커밋.

### r5 이관 6건 (전부)
| # | 내용 | 커밋 |
|---|---|---|
| 1 | 샘플 게이트 (brand, product) 기준 — 만료 뒤 재발행 제안도 같은 상품 샘플 관심이면 담기. 면제는 **관리자 대행 예약에서만**(체크박스), 제안 관심·유효기간 내만, 감사 로그 `order.waive_sample_gate`, A-06에 "면제됨" 표시. `feedbacksForProduct` + 테스트 | 7b3366e |
| 2 | `v_inspections_brand`(0036, sent_to_brand부터, inspected_by·template_id·photos 제외) + SQL 26 + B-09 "검품 리포트"(일치율·항목별·불량). A-06 기준서 컬러의 `name_zh` 대체 제거(결과가 브랜드에 나가므로) | a55dca6 · d805218 |
| 3 | `rebuildInvoice` — 새로 선점하지 않고 이 발주서가 든 차감·물류비·사용 크레딧(감사 로그)으로 재계산. 크레딧 단계 전 실패면 그때만 원자적 사용. snapshot 있으면 확인 후 강제. `order.invoice_rebuild` | b9384a8 |
| 4 | 취소 간선: ADMIN은 confirmed 전 전부(stock_checking·hold_confirmed·quoting·qty_confirmed·final_quoted 추가), 브랜드는 deposit_pending(입금 확인 전 — 서버 가드). 관리자 취소 감사에 `deposit_confirmed_at`. **발주 전이표 전수 테스트** | ec111ff |
| 5 | `append_backorder_log` RPC(0037, 서비스 롤, 상태 조건) + SQL 27, 브랜드 선택·관리자 갱신 둘 다 | 8d37df5 · 1069ef7 |
| 6 | digest CN 09:00 CST: `digestDue(locale, utcHour)`, `vercel.json` digest `0 0,1 * * *` | 5918dd2 |

### 8단계 남은 일 → 완료
- **알림 라우팅 전수**: `lib/notify-rules.ts`(순수)로 분리 — `EVENT_AUDIENCE`가 모든 이벤트 type을 키로 가져야 컴파일(전수), 테스트: ko·zh 제목 전부, D17 instant/digest, 브랜드↔CN 교차 없음. **zh 제목 18개** 채움. **3회 실패 → ADMIN 인앱**(`notify.delivery_failed`, digest 등급이라 맴돌지 않음). `recipients()` 모듈 캐시 60초.
- **CN 질문 게이트(A-02)**: 관리자 보류/해제·한국어 문구 수정·바로 노출·직접 답변(전부 감사 로그). 브랜드 B-03에서 답변(선택지는 원문 zh로 CN에 회신, 자유 답변은 번역). `cn_question.answered` → CN 즉시. 답변된 질문은 배치가 노출하지 않음. **0038**: 브랜드가 `cn_questions` 테이블을 직접 읽어 `body_zh`를 보고 모든 컬럼을 update할 수 있던 정책 제거 → `v_cn_questions_brand`(한국어만) + SQL 28.
- **통합 코멘트**: `lib/comments.ts`(가시성·번역 방향·알림 대상, 전수 테스트) · `lib/actions/comments.ts#addComment`(대상 소유 확인 — 브랜드 멤버/CN 본인 배정·본인 상품 — 번역은 본문 하나, cn만) · `lib/db/comments.ts`(브랜드는 body_ko만, CN은 RLS, ADMIN 전부) · `components/domain/comment-thread.tsx`. 배치: 브랜드 요청·샘플·발주 상세(brand), 관리자 요청(brand·internal + 항목별 cn·brand·internal)·샘플·발주(brand·internal), CN 항목(cn). `comment.added` 즉시, 상대에게만.
- **타임라인**: 샘플·발주 상세를 `audit_logs` 전이로(이전 데이터는 단계 시각 대체).
- **핸드오프 카드 14건**: `lib/handoff.ts`(요청 4·샘플 4·발주 6, 담당·문구 키·CTA) + 샘플·발주 상세 카드. 요청 상세도 같은 템플릿으로.
- `.env.example` 저장소 포함(`!.env.example`), GETTING_STARTED에 "크론 `*/5`는 Vercel Pro".
- 게이트: vitest 168 · tsc · eslint · build · SQL 28/28.

### 안 한 일
- 수신 설정 화면(digest 끄기) — DECISIONS r6-2대로 10단계 B-10과 함께.
- 샘플 기한 브랜드 리마인드 digest, "예상 제안일 초과" 이벤트(LOW).
- WeCom 원청별 webhook(`vendors.wecom_webhook`) — CN_VENDOR 활성화 전 필수(DECISIONS r6-4), 지금은 그룹 봇 1개.
- 코멘트 대상 중 `offer`(브랜드 B-04 카드)·`order_line` 화면 배치 — 액션·규칙은 지원, UI는 라인시트 정리 때.
- E2E(브랜드 세션 코멘트 스레드 금지 키 스캔)는 Playwright 묶음 때.

### 질문 (보수적 기본값으로 진행)
7. **기획서 §11 핸드오프 표 14건**이 저장소·드라이브에 없어 PRD 9장 흐름에서 도출했다(요청: 접수·보완·소싱·제안 / 샘플: 입금·이동·피드백·회수 / 발주: 재고 확인·선금·수량 확정·확정 대기·발송·검수 보고). 기획서 표와 대조해 주세요 — `lib/handoff.ts` 한 곳만 고치면 된다.
8. 샘플 게이트 면제는 **관리자 대행 예약 화면의 체크박스**로 넣었다(A-06 발주 상세는 예약 뒤라 면제가 의미 없음 → 표시만). DECISIONS r5-4의 "A-06 토글"이 예약 전 단계를 뜻했는지 확인.
9. 코멘트 알림은 전부 **instant**(대화는 상대가 바로 알아야 함). 많아지면 digest로 내릴지?
10. CN 질문에 위아더가 직접 답하면 브랜드에는 노출하지 않고 닫는다. 브랜드에게도 "이렇게 답했어요"를 보일지?
