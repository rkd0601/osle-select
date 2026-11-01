-- 0028 CN 발주 뷰에 라인 출고 상태 추가 (별도 커밋). 브랜드 grant에는 넣지 않는다(CN 운송장은 내부 정보).
create or replace view v_order_lines_cn with (security_invoker = false) as
select l.id, l.order_id, l.variant_id, l.expected_qty, l.qty, l.stock_result, l.confirmed_qty, l.cn_note,
  l.backorder_status, l.backorder_qty, l.backorder_eta,
  o.status as order_status, o.due_at, o.gb_close_date, o.created_at as ordered_at,
  p.id as product_id, p.code as product_code, p.name_zh, pc.name_zh as color_zh, ps.label as size_label,
  case when auth_role() = 'CN_SOURCER' then b.name else 'Brand #' || left(o.brand_id::text, 4) end as brand_label,
  l.cn_tracking as line_cn_tracking, l.cn_shipped_at as line_cn_shipped_at
from order_lines l
join orders o on o.id = l.order_id
join offers f on f.id = l.offer_id
join products p on p.id = f.product_id
join brands b on b.id = o.brand_id
left join product_variants pv on pv.id = l.variant_id
left join product_colors pc on pc.id = pv.color_id
left join product_sizes ps on ps.id = pv.size_id
where p.created_by = auth.uid() or is_admin();
-- down: 0024 정의로
