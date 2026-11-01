-- 0016 Cowork 결정 로그(2026-11-01) 반영 + 5단계 리뷰 — 스키마·데이터·함수. 뷰·RLS는 0017.

-- Q5: CN_VENDOR(원청 본인) 계정은 원청 1곳에 고정된다. 원청 생성·변경은 CN_SOURCER/ADMIN만.
alter table vendors add column if not exists owner_profile_id uuid references profiles(id) on delete set null;
create unique index if not exists vendors_owner_profile_uq on vendors(owner_profile_id) where owner_profile_id is not null;

-- Q2: 예상 수량은 코드값. 기존 자유 입력은 tbd로.
update request_items set expected_qty_range = 'tbd'
where expected_qty_range is not null and expected_qty_range not in ('lt30','30_100','100_300','300_1000','gt1000','tbd');
alter table request_items drop constraint if exists request_items_expected_qty_range_chk;
alter table request_items add constraint request_items_expected_qty_range_chk
  check (expected_qty_range is null or expected_qty_range in ('lt30','30_100','100_300','300_1000','gt1000','tbd'));

-- 디테일 수정 옵션 항목은 코드값(브랜드에 중국어 자유 입력이 보이던 문제, 5단계 리뷰 1). 모르는 값은 other로.
update vendors set default_mod_options = (
  select coalesce(jsonb_agg(case when e->>'item' in ('add_color','length','fabric','button','embroidery','print','lining','fit','other') then e else jsonb_set(e, '{item}', '"other"') end), '[]'::jsonb)
  from jsonb_array_elements(default_mod_options) e)
where jsonb_typeof(default_mod_options) = 'array' and jsonb_array_length(default_mod_options) > 0;
update products set mod_options_override = (
  select coalesce(jsonb_agg(case when e->>'item' in ('add_color','length','fabric','button','embroidery','print','lining','fit','other') then e else jsonb_set(e, '{item}', '"other"') end), '[]'::jsonb)
  from jsonb_array_elements(mod_options_override) e)
where jsonb_typeof(mod_options_override) = 'array' and jsonb_array_length(mod_options_override) > 0;

-- 독점(D15)을 DB에서 원자적으로 (5단계 리뷰 8): 상품 단위 advisory lock → 충돌 검사 → insert 를 한 트랜잭션에서.
-- 앱(issueOffer)은 사전 검사로 사용자에게 사유를 보여주고, 최종 판정은 이 함수가 한다. 서비스 롤 전용.
create or replace function issue_offer_locked(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_product uuid := (p->>'product_id')::uuid; v_brand uuid := (p->>'brand_id')::uuid; v_item uuid := nullif(p->>'request_item_id','')::uuid;
begin
  perform pg_advisory_xact_lock(hashtext('offer:' || v_product::text));
  if exists (select 1 from offers o where o.product_id = v_product and o.brand_id = v_brand
             and coalesce(o.request_item_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_item, '00000000-0000-0000-0000-000000000000'::uuid)
             and o.status in ('new','interested','hold','recheck','reconsent_pending')) then
    raise exception 'offer_duplicate' using errcode = 'P0001';
  end if;
  if exists (select 1 from offers o where o.product_id = v_product and o.brand_id <> v_brand
             and o.status in ('new','interested','hold','recheck','reconsent_pending') and o.exclusive_until >= current_date) then
    raise exception 'offer_exclusive' using errcode = 'P0001';
  end if;
  insert into offers (product_id, brand_id, request_item_id, type, status, price_tiers, fee_rate, hidden_margin_rate, fx_rate,
                      sample_fee_product_krw, sample_logistics_krw, option_prices, valid_until, exclusive_until, issued_by, admin_comment, owner_role, due_at)
  values (v_product, v_brand, v_item, (p->>'type')::offer_type, 'new', p->'price_tiers', (p->>'fee_rate')::numeric, (p->>'hidden_margin_rate')::numeric, (p->>'fx_rate')::numeric,
          (p->>'sample_fee_product_krw')::int, (p->>'sample_logistics_krw')::int, coalesce(p->'option_prices', '{"labels":[],"mods":[]}'::jsonb),
          (p->>'valid_until')::date, nullif(p->>'exclusive_until','')::date, (p->>'issued_by')::uuid, nullif(p->>'admin_comment',''),
          (p->>'owner_role')::owner_role, nullif(p->>'due_at','')::timestamptz)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function issue_offer_locked(jsonb) from public, anon, authenticated;

-- down
-- drop function if exists issue_offer_locked(jsonb);
-- alter table request_items drop constraint if exists request_items_expected_qty_range_chk;
-- drop index if exists vendors_owner_profile_uq; alter table vendors drop column if exists owner_profile_id;
