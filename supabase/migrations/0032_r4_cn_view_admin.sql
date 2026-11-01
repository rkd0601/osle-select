-- 0032 Cowork r4 #6(뷰): CN 마스킹 뷰를 ADMIN이 볼 때는 브랜드명을 그대로 (관리자 대행·디버깅). CN_VENDOR 마스킹은 유지.
create or replace view v_sample_items_cn with (security_invoker = false) as
select si.id, si.sample_request_id, si.offer_id, si.variant_id, si.qty, si.status, si.feedback, si.feedback_reason, si.feedback_note_zh,
  sr.status as request_status, sr.payment_required, sr.payment_confirmed_at, sr.cn_tracking, sr.cn_shipped_at, sr.due_at, sr.created_at as requested_at,
  p.id as product_id, p.code as product_code, p.name_zh, pc.name_zh as color_zh, ps.label as size_label,
  case when auth_role() in ('CN_SOURCER', 'ADMIN') then b.name else 'Brand #' || left(sr.brand_id::text, 4) end as brand_label,
  si.cn_tracking as item_cn_tracking, si.cn_shipped_at as item_cn_shipped_at
from sample_items si
join sample_requests sr on sr.id = si.sample_request_id
join offers o on o.id = si.offer_id
join products p on p.id = o.product_id
join brands b on b.id = sr.brand_id
left join product_variants pv on pv.id = si.variant_id
left join product_colors pc on pc.id = pv.color_id
left join product_sizes ps on ps.id = pv.size_id
where p.created_by = auth.uid() or is_admin();

create or replace view v_order_lines_cn with (security_invoker = false) as
select l.id, l.order_id, l.variant_id, l.expected_qty, l.qty, l.stock_result, l.confirmed_qty, l.cn_note,
  l.backorder_status, l.backorder_qty, l.backorder_eta,
  o.status as order_status, o.due_at, o.gb_close_date, o.created_at as ordered_at,
  p.id as product_id, p.code as product_code, p.name_zh, pc.name_zh as color_zh, ps.label as size_label,
  case when auth_role() in ('CN_SOURCER', 'ADMIN') then b.name else 'Brand #' || left(o.brand_id::text, 4) end as brand_label,
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

-- down: 0026 · 0028 정의로
