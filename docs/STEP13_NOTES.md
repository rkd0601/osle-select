# 13단계 노트 — CN_VENDOR 온보딩 준비 · 디자인 라운드 준비 (저장소 안에서 되는 것)

Claude Code(개발) → Cowork(기획·검증). 기준: CLAUDE_CODE_NEXT r9 §2, DECISIONS r9(11-1·11-4·r6-4). 스테이징 E2E·로그인 서버 액션 전환(11-3)은 Jay가 Supabase 스테이징·Vercel Preview를 만든 뒤.

## 한 것 (2026-11-02)
커밋: 49097e9(대비) · 5853388(소싱 전용 사전) · 134a6da(0050) · 867e2c9(0051·SQL 37·사전 점검) · e6574ce(원청 웹훅) · 문서

### 1. 대비 (DECISIONS 11-1)
- 본문 크기(`text-body`·`text-lead`)와 함께 쓰던 `text-muted` **37곳 → `text-ink-2`**(6.87:1). `muted`는 캡션·메타·큰 숫자 라벨 전용.
- `tests/unit/a11y.test.ts`가 같은 클래스 문자열에 `text-muted` + `text-body|lead`가 다시 들어오면 막는다.
- 크기 클래스 없이 부모 크기를 물려받는 muted 85곳은 정적으로 크기를 알 수 없어 남김 → 디자인 라운드(`docs/DESIGN_TOKENS.md` §1).

### 2. 원청 계정(CN_VENDOR)에 목표 원가 문구도 안 내려가게 (DECISIONS 11-4)
- `cn.item.target`("목표 원가 ≈ ¥{cny}" / "目标进价 ≈ ¥{cny}")을 **`lib/i18n/cn-sourcer.ts`(`server-only`)** 사전으로. C-01 항목 상세(서버 컴포넌트)만 쓴다.
- 원청 계정은 뷰가 희망 단가를 가리지만 코드에서도 `u.role !== "CN_VENDOR"`일 때만 계산.
- 테스트: cn 사전에 `목표 원가|目标进价|目标成本` 0, 소싱 사전 ko/zh 키 일치, `"use client"` 파일·영역 밖 import 금지. 빌드 확인: `.next/static` 클라이언트 청크에 "目标进价/목표 원가" 0.
- 이로써 cn 사전 = 소싱 담당과 원청이 함께 보는 문구. 원청 편집 화면(C-03)의 원가 입력 라벨(`product.cost` "원가 ¥"/"单价 ¥")은 원청이 자기 가격을 넣는 칸이라 남겼다 — 질문 1.

### 3. 원청별 WeCom 웹훅 (DECISIONS r6-4, CN_VENDOR 활성화 전 필수)
- **0050 `vendor_channels`**(vendor_id PK, `wecom_webhook` 형식 check = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…`). `vendors`에 두지 않은 이유: CN 세션이 `vendors` 행을 읽을 수 있어(`vendors_cn_select`) 다른 원청의 웹훅 키가 보인다.
- **0051** RLS on + 정책 없음 + `anon`·`authenticated` 권한 회수 → 서비스 롤만. SQL 체크 37(형식·CN_VENDOR·ADMIN 세션 읽기 불가). 사전 점검에 "세션 읽기 가능", "웹훅 없는 CN_VENDOR 원청" 추가.
- 발송: `lib/notify-rules#wecomUrlFor` — CN_VENDOR는 자기 원청 웹훅만, **없으면 보내지 않음(인앱만, 그룹 봇 대체 없음)**, 소싱 담당은 그룹 봇. `notify-delivery`가 `vendors.owner_profile_id → vendor_channels`로 찾는다. 테스트 1.
- A-08 원청 관리: 수정 화면에 쓰기 전용 웹훅 입력(저장한 키는 화면에 다시 안 내려옴, "설정됨/없음"만), 삭제, 목록에 "WeCom 웹훅 없음"(계정 연결된 원청만). 감사 `vendor.webhook_update`는 설정 여부만 기록(키 비기록).

### 4. 디자인 라운드 준비
- **`docs/DESIGN_TOKENS.md`**: 색 13개(값·쓰임 횟수·역할·대비·Figma 이름 칸), 대비 후보 2색, **타입 17→9단계 매핑**(11·12·13·14·16·20·24·28·40 — `:root`만 교체), 글꼴, 남은 임의 값, 라운드 체크리스트.

## 안 한 것 (외부 입력 대기)
- 스테이징 Supabase·Vercel Preview → `e2e.yml` 첫 실행 → 셀렉터 보정 → 로그인 서버 액션(11-3). 절차 `docs/DEPLOY_CHECKLIST.md`.
- slug 승인 취소 경합의 DB 수준 테스트 — 코드 순서로 막았고, 실제 경합은 E2E 환경에서.

## 질문 (보수적 기본값으로 진행)
1. C-03 원가 입력 라벨: 원청 계정에게 "원가 ¥"(ko)/"单价 ¥"(zh)와 "成本价档"(공개 조건 체크 라벨)가 보인다. 원청 본인 가격이라 문제는 없다고 봤다 — zh `product.field.costTiers`·`product.check.cost`를 원청에게 더 자연스러운 "报价档"로 바꿀지. 기본값: 그대로.
2. 원청 웹훅이 없을 때 원청 알림을 **내부 그룹 봇으로라도** 보낼지. 기본값: 보내지 않음(원청에 안 닿고, 그룹이 원청 공용이 되면 다른 원청 알림이 섞임) — 대신 사전 점검·A-08 목록이 잡는다.
3. 타입 9단계 후보(11·12·13·14·16·20·24·28·40)를 Figma 스타일 이름과 맞출 사람·시점.

게이트: vitest 212 · tsc · eslint · build · SQL 37/37 + 사전 점검. 다음 마이그레이션 번호 **0052**.

---

## 마감 (Cowork r10 보강, 2026-11-02)
Jay 지시("전부 그냥 진행")로 Cowork가 개발 멈춤 확인 후 직접 반영. 개발 다음 마이그레이션 번호 **0053**.
- **0052 `approve_slug_change(request, actor)`**: 요청 닫기(previous_value) + `brands.slug` 교체(`where slug = 옛값`, 0행이면 `stale_slug`) + 감사 한 트랜잭션. 중복·쿨다운·취소 경합이면 전부 롤백(요청 pending 유지). `decideSlugRequest` 승인 경로는 RPC 호출로, 반려는 코드 유지. SQL 38.
- a11y 대비 규칙이 템플릿 리터럴 className도 보게(r10-2) → 잔존 2곳(`order-form.tsx`, `variant-matrix.tsx` 0 수량 칸) `text-ink-2`.
- `docs/HANDOFF.md` 운영 핸드오프(코드 근거 표기).
- 질문 1~3 답: DECISIONS 13-1·13-2·13-3.
- 게이트: vitest 212 · tsc · eslint · build · SQL 38/38.
