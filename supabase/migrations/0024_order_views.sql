-- 0024 발주 뷰·권한 (별도 커밋). 브랜드는 v_orders_brand·v_order_lines_brand, CN은 v_order_lines_cn(마스킹·KRW 없음)만.
-- CN에게 KRW 단가를 보이지 않는다: CN은 원가를 알므로 상품가와 합치면 녹인 마진이 역산된다.

-- 0010은 orders에 컬럼 grant를 줬다. 0023 새 컬럼 중 브랜드에 필요한 것만 추가로 연다.
grant select (deposit_pct, deposit_note, quoted_at, qty_confirmed_at, final_quoted_at, report_submitted_at) on orders to authenticated;

-- order_lines: 테이블 직접 조회도 컬럼 단위로, CN 정책은 뷰로 대체
revoke select on order_lines from authenticated;
grant select (id, order_id, brand_id, offer_id, variant_id, expected_qty, qty, unit_price_krw, stock_result, confirmed_qty,
  backorder_status, backorder_qty, backorder_eta, backorder_log, defect_qty, inspected_ok_qty) on order_lines to authenticated;
drop policy if exists order_lines_cn on order_lines;
drop policy if exists order_lines_cn_update on order_lines;

create or replace view v_orders_brand with (security_invoker = true) as
select o.id, o.brand_id, o.created_by, o.status, o.owner_role, o.due_at, o.gb_open_date, o.gb_close_date, o.delivery_promise_date,
  o.hold_choice, o.hold_ack, o.deposit_pct, o.deposit_krw, o.deposit_reported_at, o.deposit_confirmed_at, o.deposit_note, o.route,
  o.logistics_quote_range, o.logistics_quote_final_krw, o.quote_note, o.label_selections, o.mod_requests, o.invoice_snapshot, o.qty_change_count,
  o.confirmed_at, o.cn_shipped_at, o.kr_inspected_at, o.sent_at, o.delivered_at, o.report_due, o.report, o.report_submitted_at, o.credit_issued_krw,
  o.quoted_at, o.qty_confirmed_at, o.final_quoted_at, o.created_at, o.updated_at
from orders o
where is_admin() or o.brand_id in (select auth_brand_ids());

create or replace view v_order_lines_brand with (security_invoker = true) as
select l.id, l.order_id, l.brand_id, l.offer_id, l.variant_id, l.expected_qty, l.qty, l.unit_price_krw, l.stock_result, l.confirmed_qty,
  l.backorder_status, l.backorder_qty, l.backorder_eta, l.backorder_log, l.defect_qty, l.inspected_ok_qty
from order_lines l
where is_admin() or l.brand_id in (select auth_brand_ids());

create or replace view v_order_lines_cn with (security_invoker = false) as
select l.id, l.order_id, l.variant_id, l.expected_qty, l.qty, l.stock_result, l.confirmed_qty, l.cn_note,
  l.backorder_status, l.backorder_qty, l.backorder_eta,
  o.status as order_status, o.due_at, o.gb_close_date, o.created_at as ordered_at,
  p.id as product_id, p.code as product_code, p.name_zh, pc.name_zh as color_zh, ps.label as size_label,
  case when auth_role() = 'CN_SOURCER' then b.name else 'Brand #' || left(o.brand_id::text, 4) end as brand_label
from order_lines l
join orders o on o.id = l.order_id
join offers f on f.id = l.offer_id
join products p on p.id = f.product_id
join brands b on b.id = o.brand_id
left join product_variants pv on pv.id = l.variant_id
left join product_colors pc on pc.id = pv.color_id
left join product_sizes ps on ps.id = pv.size_id
where p.created_by = auth.uid() or is_admin();

revoke all on v_orders_brand, v_order_lines_brand, v_order_lines_cn from anon;
grant select on v_orders_brand, v_order_lines_brand, v_order_lines_cn to authenticated;

-- down
-- drop view if exists v_order_lines_cn, v_order_lines_brand, v_orders_brand;
-- revoke select on order_lines from authenticated; grant select on order_lines to authenticated;
-- (order_lines_cn·order_lines_cn_update 정책은 0020 정의로 복원)
