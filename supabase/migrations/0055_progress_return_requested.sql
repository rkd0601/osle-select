-- 0055 v_progress_brand에 sample_return_requested_at 추가(3차 검증 C1) — 뷰만(별도 커밋). 되돌리기: 맨 아래 "-- down".
-- 회수를 신청했지만 위아더가 아직 받지 않은 샘플을 "회수 완료"가 아니라 "회수 신청 · 확인 중"으로, 할 일에서는 빼기 위해.
-- create or replace view는 기존 컬럼 순서를 유지하고 맨 끝에만 덧붙일 수 있다. 보안·권한은 0054와 같다(security_invoker, v_*_brand 위).

create or replace view v_progress_brand with (security_invoker = true) as
select
  ri.id              as request_item_id,
  ri.request_id,
  ri.brand_id,
  r.title            as request_title,
  r.created_at       as request_created_at,
  ri.seq             as item_seq,
  ri.description     as item_description,
  ri.category        as item_category,
  ri.status          as item_status,
  ri.owner_role      as item_owner_role,
  ri.due_at          as item_due_at,
  o.id               as offer_id,
  o.product_id,
  o.status           as offer_status,
  o.reaction         as offer_reaction,
  o.price_tiers,
  o.fee_rate,
  o.exclusive_until,
  o.valid_until,
  o.issued_at        as offer_issued_at,
  s.sample_request_id,
  s.sample_status,
  s.sample_owner_role,
  s.sample_due_at,
  s.sample_qty,
  s.sample_feedback,
  s.sample_return_status,
  s.sample_feedback_due,
  s.sample_return_due,
  s.sample_payment_reported_at,
  od.order_id,
  od.order_status,
  od.order_owner_role,
  od.order_due_at,
  od.order_qty,
  od.order_deposit_reported_at,
  od.order_report_due,
  od.order_created_at,
  s.sample_return_requested_at
from v_request_items_brand ri
join v_requests_brand r on r.id = ri.request_id
left join v_offers_brand o on o.request_item_id = ri.id
left join lateral (
  select sr.id as sample_request_id, sr.status as sample_status, sr.owner_role as sample_owner_role, sr.due_at as sample_due_at,
         sum(si.qty)::int as sample_qty,
         (array_agg(si.feedback order by si.created_at desc))[1] as sample_feedback,
         (array_agg(si.return_status order by si.created_at desc))[1] as sample_return_status,
         sr.feedback_due as sample_feedback_due, sr.return_due as sample_return_due, sr.payment_reported_at as sample_payment_reported_at,
         (array_agg(si.return_requested_at order by si.created_at desc))[1] as sample_return_requested_at
  from v_sample_items_brand si
  join v_sample_requests_brand sr on sr.id = si.sample_request_id
  where o.id is not null and si.offer_id = o.id and sr.status <> 'cancelled'
  group by sr.id, sr.status, sr.owner_role, sr.due_at, sr.feedback_due, sr.return_due, sr.payment_reported_at, sr.created_at
  order by sr.created_at desc
  limit 1
) s on true
left join lateral (
  select ob.id as order_id, ob.status as order_status, ob.owner_role as order_owner_role, ob.due_at as order_due_at,
         sum(coalesce(nullif(l.qty, 0), l.expected_qty))::int as order_qty,
         ob.deposit_reported_at as order_deposit_reported_at, ob.report_due as order_report_due, ob.created_at as order_created_at
  from v_order_lines_brand l
  join v_orders_brand ob on ob.id = l.order_id
  where o.id is not null and l.offer_id = o.id and ob.status <> 'cancelled'
  group by ob.id, ob.status, ob.owner_role, ob.due_at, ob.deposit_reported_at, ob.report_due, ob.created_at
) od on true;

revoke all on v_progress_brand from anon;
grant select on v_progress_brand to authenticated;

-- down
-- 0054_progress_brand_view.sql 의 create or replace view 를 다시 실행하면 이 컬럼만 빠진다(마지막 컬럼 삭제는 drop view 후 재생성).
