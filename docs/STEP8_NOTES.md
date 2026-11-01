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

## 남은 일 (8단계)
- 통합 코멘트 `comment-thread`(대상 6종, brand/internal/cn 가시성, ko↔zh 번역·원문 병기) + `addComment` → notify.
- A-02 CN 질문 게이트 화면(4시간 안 보류·답변·수정) — 배치 해제는 완료.
- 타임라인을 `audit_logs`에서(요청·샘플·발주 상세), 핸드오프 카드(기획서 §11 14건 템플릿).
- 알림 라우팅 전수 테스트(이벤트 → 수신 역할·kind), 수신 설정 화면(digest 끄기).
- `.env.example`이 `.gitignore`(`.env*`)에 걸려 저장소에 없다 — `!.env.example` 예외를 둘지 Cowork 결정 필요(질문 6).

### 질문 추가
6. `.env.example`을 저장소에 넣을까? (지금은 로컬에만 있고 MAIL_FROM·CRON_SECRET를 추가해 뒀다)
