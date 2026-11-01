-- 0013 관리자 대행(on_behalf) 시 브랜드 화면이 비어 보이던 문제. 리뷰 1번.
-- ADMIN은 brand_members에 없으므로 auth_brand_ids() 필터만 있으면 /b/{slug}가 빈 목록·404가 된다.
-- 브랜드 측 코드는 항상 .eq("brand_id", brand.id)를 같이 걸기 때문에(이중 방어) ADMIN도 해당 브랜드 행만 본다.
-- 제안·상품 뷰(v_offers_brand 등)는 5단계(B-04) 착수 때 같은 방식으로 맞춘다.

create or replace view v_requests_brand with (security_invoker = true) as
select r.id, r.brand_id, r.created_by, r.title, r.memo, r.target_date, r.created_via, r.created_at, r.updated_at
from requests r
where is_admin() or r.brand_id in (select auth_brand_ids());

create or replace view v_request_items_brand with (security_invoker = true) as
select
  ri.id, ri.request_id, ri.brand_id, ri.seq, ri.category, ri.description, ri.target_price_krw, ri.expected_qty_range,
  ri.status, ri.owner_role, ri.due_at,
  ri.sla_date as expected_offer_date,
  ri.created_at, ri.updated_at
from request_items ri
where is_admin() or ri.brand_id in (select auth_brand_ids());

-- down: 0009 정의로 되돌린다 (where 절에서 is_admin() or 제거)
