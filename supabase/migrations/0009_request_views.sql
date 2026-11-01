-- 0009 요청 영역 뷰 (B-02·B-03·C-01). 브랜드 측 코드는 requests/request_items 테이블 대신 이 뷰만 쓴다.
-- 브랜드 뷰: security_invoker = true → 기반 테이블 RLS(brand_id in auth_brand_ids())와 0008 컬럼 grant가 그대로 적용된다.
-- 중국어 원문(*_zh)·CN 담당자(assigned_to)·AI 태그는 제외한다.

create or replace view v_requests_brand with (security_invoker = true) as
select r.id, r.brand_id, r.created_by, r.title, r.memo, r.target_date, r.created_via, r.created_at, r.updated_at
from requests r
where r.brand_id in (select auth_brand_ids());

create or replace view v_request_items_brand with (security_invoker = true) as
select
  ri.id, ri.request_id, ri.brand_id, ri.seq, ri.category, ri.description, ri.target_price_krw, ri.expected_qty_range,
  ri.status, ri.owner_role, ri.due_at,
  ri.sla_date as expected_offer_date,          -- 브랜드에게는 "예상 제안일"로 보인다
  ri.created_at, ri.updated_at
from request_items ri
where ri.brand_id in (select auth_brand_ids());

-- CN 뷰에 요청 메모(중국어)와 항목 생성 시각을 덧붙인다. 기존 컬럼 순서는 유지(create or replace는 뒤에만 추가 가능).
create or replace view v_request_items_cn with (security_invoker = false) as
select
  ri.id, ri.request_id, ri.seq, ri.category, ri.description_zh, ri.expected_qty_range, ri.status, ri.due_at, ri.sla_date, ri.ai_tags,
  case when auth_role() = 'CN_SOURCER' then ri.target_price_krw end as target_price_krw,
  case when auth_role() = 'CN_SOURCER' then b.name else 'Brand #' || left(ri.brand_id::text, 4) end as brand_label,
  r.memo_zh as request_memo_zh,
  ri.created_at
from request_items ri
join brands b on b.id = ri.brand_id
join requests r on r.id = ri.request_id
where ri.assigned_to = auth.uid();

revoke all on v_requests_brand, v_request_items_brand, v_request_items_cn from anon;
grant select on v_requests_brand, v_request_items_brand to authenticated;
grant select on v_request_items_cn to authenticated;

-- 상태 이력(타임라인)은 audit_logs(action = 'transition')에 남기고 서버에서 읽어 역할별로 가공한다. 스키마 추가 없음.
create index if not exists audit_logs_entity_idx on audit_logs(entity, entity_id, created_at);

-- down
-- drop view if exists v_requests_brand, v_request_items_brand;
-- (v_request_items_cn은 0004 정의로 되돌린다)
-- drop index if exists audit_logs_entity_idx;
