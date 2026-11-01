-- 0004 브랜드·CN용 뷰. security_invoker = true 이므로 기반 테이블 RLS가 그대로 적용된다.
-- 브랜드 뷰는 원가·원청·녹인 마진·환율·중국어 원문·중량을 절대 포함하지 않는다. PRD 6장.

create or replace view v_offers_brand with (security_invoker = true) as
select
  o.id, o.product_id, o.brand_id, o.request_item_id, o.type, o.status, o.reaction, o.decline_reason, o.decline_note,
  o.price_tiers,                                      -- [{min_qty, product_price_krw}]
  o.fee_rate,                                         -- 노출되는 서비스 수수료
  o.sample_fee_product_krw, o.valid_until, o.exclusive_until, o.issued_at, o.reacted_at, o.admin_comment, o.owner_role, o.due_at
from offers o
where o.brand_id in (select auth_brand_ids());

create or replace view v_products_brand with (security_invoker = false) as
select
  p.id, p.code, p.status, p.category, p.name_ko, p.desc_ko, p.fabric, p.origin, p.care_codes,
  case when p.show_quality_note then p.quality_note_ko end as quality_note_ko,
  p.supply_type, p.lead_days, p.production_moq, p.min_qty, p.sample_ok,
  p.verified_in_person, p.verified_at,
  coalesce(p.hold_override, v.default_hold) as hold,
  coalesce(p.label_options_override, v.default_label_options) as label_options,
  coalesce(p.mod_options_override, v.default_mod_options) as mod_options
from products p
left join vendors v on v.id = p.vendor_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = p.id and o.brand_id in (select auth_brand_ids()));
-- security_invoker=false: 브랜드는 products/vendors 테이블 권한이 없으므로 definer(소유자) 권한으로 읽되,
-- 노출 범위는 위 where(제안이 걸린 상품만)와 선택된 컬럼으로 제한한다.

create or replace view v_product_images_brand with (security_invoker = false) as
select i.id, i.product_id, i.storage_path, i.kind, i.source, i.usable_for_sales, i.sort_order, i.color_id
from product_images i
where exists (select 1 from offers o where o.product_id = i.product_id and o.brand_id in (select auth_brand_ids()));

create or replace view v_product_colors_brand with (security_invoker = false) as
select c.id, c.product_id, c.name_ko, c.hex, c.sort_order
from product_colors c
where exists (select 1 from offers o where o.product_id = c.product_id and o.brand_id in (select auth_brand_ids()));

create or replace view v_product_sizes_brand with (security_invoker = false) as
select s.id, s.product_id, s.label, s.measurements, s.source, s.sort_order
from product_sizes s
where exists (select 1 from offers o where o.product_id = s.product_id and o.brand_id in (select auth_brand_ids()));

create or replace view v_product_variants_brand with (security_invoker = false) as
select pv.id, pv.product_id, pv.color_id, pv.size_id
from product_variants pv
where exists (select 1 from offers o where o.product_id = pv.product_id and o.brand_id in (select auth_brand_ids()));

-- CN_VENDOR용 요청 항목 뷰: 브랜드명·희망 단가 마스킹. CN_SOURCER는 희망 단가(CNY 환산은 앱에서) 열람.
-- security_invoker=false: CN은 brands 테이블 정책이 없으므로 definer 권한으로 조인하되, assigned_to = auth.uid() 로만 노출.
create or replace view v_request_items_cn with (security_invoker = false) as
select
  ri.id, ri.request_id, ri.seq, ri.category, ri.description_zh, ri.expected_qty_range, ri.status, ri.due_at, ri.sla_date, ri.ai_tags,
  case when auth_role() = 'CN_SOURCER' then ri.target_price_krw end as target_price_krw,
  case when auth_role() = 'CN_SOURCER' then b.name else 'Brand #' || left(ri.brand_id::text, 4) end as brand_label
from request_items ri
join brands b on b.id = ri.brand_id
where ri.assigned_to = auth.uid();

-- 관리자 큐: 지연 순
create or replace view v_admin_queue with (security_invoker = true) as
select 'request_item' as entity, id, brand_id, status::text as status, owner_role, due_at, (now() - due_at) as overdue from request_items where owner_role = 'ADMIN' and due_at is not null
union all select 'product', id, null, status::text, owner_role, due_at, (now() - due_at) from products where owner_role = 'ADMIN' and due_at is not null
union all select 'offer', id, brand_id, status::text, owner_role, due_at, (now() - due_at) from offers where owner_role = 'ADMIN' and due_at is not null
union all select 'sample_request', id, brand_id, status::text, owner_role, due_at, (now() - due_at) from sample_requests where owner_role = 'ADMIN' and due_at is not null
union all select 'order', id, brand_id, status::text, owner_role, due_at, (now() - due_at) from orders where owner_role = 'ADMIN' and due_at is not null;
