-- 0030 브랜드에 발송 운송장 공개 (별도 커밋). 컬럼은 뷰 끝에 추가(create or replace view 제약).
grant select (kr_tracking) on orders to authenticated;

create or replace view v_orders_brand with (security_invoker = true) as
select o.id, o.brand_id, o.created_by, o.status, o.owner_role, o.due_at, o.gb_open_date, o.gb_close_date, o.delivery_promise_date,
  o.hold_choice, o.hold_ack, o.deposit_pct, o.deposit_krw, o.deposit_reported_at, o.deposit_confirmed_at, o.deposit_note, o.route,
  o.logistics_quote_range, o.logistics_quote_final_krw, o.quote_note, o.label_selections, o.mod_requests, o.invoice_snapshot, o.qty_change_count,
  o.confirmed_at, o.cn_shipped_at, o.kr_inspected_at, o.sent_at, o.delivered_at, o.report_due, o.report, o.report_submitted_at, o.credit_issued_krw,
  o.quoted_at, o.qty_confirmed_at, o.final_quoted_at, o.created_at, o.updated_at, o.kr_tracking
from orders o
where is_admin() or o.brand_id in (select auth_brand_ids());
-- down: 0024 정의로, revoke select (kr_tracking) on orders from authenticated;
