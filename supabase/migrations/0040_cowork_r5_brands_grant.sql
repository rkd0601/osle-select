-- 0040 Cowork 5라운드 (권한 — 별도 커밋). 번호 0036~0039는 개발(8단계)용으로 비워 둔다.
-- 브랜드 세션이 brands 테이블을 직접 읽으면 hidden_margin_rate·fee_rate 가 보였다(0005 전체 select + 0003 소속 행 정책). PRD 2장 "브랜드 비노출".
-- 앱 코드는 default_address·tier만 읽지만 anon 키 + JWT로 PostgREST를 직접 치면 읽힌다 → 컬럼 단위 grant.
revoke select, insert, update on brands from authenticated;
grant select (id, slug, name, type, tier, channels, default_address, credit_balance_krw, status, approved_at, created_at, updated_at) on brands to authenticated;

-- 0008 "상태 테이블은 세션에서 읽기 전용" 자세와 맞춘다: inspections·inspection_templates 도 insert/update 회수 (RLS에 insert 정책이 없어 지금도 막히지만 권한 자체를 닫는다)
revoke insert, update on inspections, inspection_templates from authenticated;

-- down
-- grant select, insert, update on brands, inspections, inspection_templates to authenticated;
