-- 0015 제안·상품 브랜드 뷰: 관리자 대행 노출 + 발행 고정 금액 컬럼. 뷰·권한만 (CLAUDE.md: 별도 커밋).
-- 0013(요청 뷰)과 같은 원칙: ADMIN은 brand_members에 없으므로 is_admin()을 함께 본다. 브랜드 측 코드는 항상 brand_id로 다시 거른다.
-- 새 컬럼(option_prices, sample_logistics_krw)은 원가 키가 없는 KRW 금액뿐이다. status_before_recheck는 내부용 — 노출하지 않는다.

grant select (option_prices, sample_logistics_krw) on offers to authenticated;

create or replace view v_offers_brand with (security_invoker = true) as
select
  o.id, o.product_id, o.brand_id, o.request_item_id, o.type, o.status, o.reaction, o.decline_reason, o.decline_note,
  o.price_tiers, o.fee_rate, o.sample_fee_product_krw, o.valid_until, o.exclusive_until, o.issued_at, o.reacted_at, o.admin_comment, o.owner_role, o.due_at,
  o.option_prices, o.sample_logistics_krw
from offers o
where (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck';

create or replace view v_products_brand with (security_invoker = false) as
select
  p.id, p.code, p.status, p.category, p.name_ko, p.desc_ko, p.fabric, p.origin, p.care_codes,
  case when p.show_quality_note then p.quality_note_ko end as quality_note_ko,
  p.supply_type, p.lead_days, p.production_moq, p.min_qty, p.sample_ok,
  p.verified_in_person, p.verified_at,
  coalesce(p.hold_override, v.default_hold) as hold,
  strip_cost_keys(coalesce(p.label_options_override, v.default_label_options)) as label_options,
  strip_cost_keys(coalesce(p.mod_options_override, v.default_mod_options)) as mod_options
from products p
left join vendors v on v.id = p.vendor_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = p.id and (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck');

create or replace view v_product_images_brand with (security_invoker = false) as
select i.id, i.product_id, i.storage_path, i.kind, i.source, i.usable_for_sales, i.sort_order, i.color_id
from product_images i join products p on p.id = i.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = i.product_id and (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck');

create or replace view v_product_colors_brand with (security_invoker = false) as
select c.id, c.product_id, c.name_ko, c.hex, c.sort_order
from product_colors c join products p on p.id = c.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = c.product_id and (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck');

create or replace view v_product_sizes_brand with (security_invoker = false) as
select s.id, s.product_id, s.label, s.measurements, s.source, s.sort_order
from product_sizes s join products p on p.id = s.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = s.product_id and (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck');

create or replace view v_product_variants_brand with (security_invoker = false) as
select pv.id, pv.product_id, pv.color_id, pv.size_id
from product_variants pv join products p on p.id = pv.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = pv.product_id and (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck');

revoke all on v_offers_brand, v_products_brand, v_product_images_brand, v_product_colors_brand, v_product_sizes_brand, v_product_variants_brand from anon;
grant select on v_offers_brand, v_products_brand, v_product_images_brand, v_product_colors_brand, v_product_sizes_brand, v_product_variants_brand to authenticated;

-- down: 0010 정의로 되돌린다 (is_admin() or 제거, v_offers_brand 끝 두 컬럼 제거는 drop/create 필요)
-- revoke select (option_prices, sample_logistics_krw) on offers from authenticated;
