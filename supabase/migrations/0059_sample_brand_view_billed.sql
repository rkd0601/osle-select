-- 0059 v_sample_requests_brand에 logistics_billed_order_id 추가 (NEXT §0-l S6 — 청구 예정의 후불 물류비) — 뷰·권한만(별도 커밋).
-- 후불 물류비가 이미 발주 청구에 붙었는지(어느 발주서에 합산됐는지) 브랜드가 알아야 "청구 예정"에서 두 번 세지 않는다.
-- 값은 같은 브랜드의 발주서 id라 원가와 무관하다. 뷰가 security_invoker라 칼럼 단위 select 권한도 함께 준다(0026과 같은 방식).
-- create or replace view는 기존 칼럼 순서를 유지하고 맨 끝에만 덧붙일 수 있다.

grant select (logistics_billed_order_id) on sample_requests to authenticated;

create or replace view v_sample_requests_brand with (security_invoker = true) as
select sr.id, sr.brand_id, sr.requested_by, sr.status, sr.owner_role, sr.due_at, sr.ship_to, sr.logistics_fee_krw, sr.product_fee_total_krw,
  sr.payment_required, sr.payment_reported_at, sr.payment_confirmed_at, sr.payment_note, sr.cn_shipped_at, sr.kr_arrived_at, sr.inspected_at,
  sr.kr_tracking, sr.sent_at, sr.delivered_at, sr.feedback_due, sr.return_due, sr.created_at, sr.updated_at,
  sr.logistics_billed_order_id
from sample_requests sr
where is_admin() or sr.brand_id in (select auth_brand_ids());

revoke all on v_sample_requests_brand from anon;
grant select on v_sample_requests_brand to authenticated;

-- down
-- create or replace view는 칼럼을 뺄 수 없다 → drop 후 0022 정의로 다시:
-- drop view if exists v_sample_requests_brand;
-- (0022_sample_views.sql의 v_sample_requests_brand 정의 + revoke/grant 실행)
-- revoke select (logistics_billed_order_id) on sample_requests from authenticated;
