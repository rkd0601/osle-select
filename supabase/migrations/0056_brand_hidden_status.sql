-- 0056 브랜드 숨김 상태 (COWORK_DECISIONS d-23 · NEXT §0-j E1). 스키마만 — RLS·뷰·권한 변경 없음.
-- E2E·시험 브랜드를 지우지 않고 'hidden'으로 옮긴다: 관리자 목록·선택 목록에서 빠지고, 브랜드 화면은 정지와 같이 닫힌다
-- (lib/auth/session·guards는 status <> 'active'를 이미 막는다). 전이는 lib/transitions.ts `brand` 표(위아더만).
-- 0002의 인라인 check는 Postgres 기본 이름 brands_status_check.

alter table brands drop constraint if exists brands_status_check;
alter table brands add constraint brands_status_check check (status in ('active', 'suspended', 'hidden'));

-- down
-- update brands set status = 'suspended' where status = 'hidden';
-- alter table brands drop constraint if exists brands_status_check;
-- alter table brands add constraint brands_status_check check (status in ('active', 'suspended'));
