-- 0010 2단계 독립 리뷰 반영 (RLS·뷰·권한 — 별도 커밋). 0008의 "쓰기는 서버 액션만" 모델 위에서 읽기 쪽 누출을 막는다.
-- 되돌리기: 맨 아래 "-- down".

-- 1) offers: 사용자 세션이 테이블을 직접 읽으면 fx_rate·hidden_margin_rate·decline_note_zh가 보였다 → 컬럼 단위 select
revoke select on offers from authenticated;
grant select (id, product_id, brand_id, request_item_id, type, status, reaction, decline_reason, decline_note,
  price_tiers, fee_rate, sample_fee_product_krw, valid_until, exclusive_until, issued_at, reacted_at, admin_comment,
  owner_role, due_at, created_at, updated_at) on offers to authenticated;

-- 2) orders: admin_memo·admin_waived·confirmed_by 제외
revoke select on orders from authenticated;
grant select (id, brand_id, created_by, status, owner_role, due_at, gb_open_date, gb_close_date, delivery_promise_date,
  hold_choice, hold_ack, deposit_krw, deposit_reported_at, deposit_confirmed_at, route, logistics_quote_range, logistics_quote_final_krw,
  quote_note, label_selections, mod_requests, invoice_snapshot, qty_change_count, confirmed_at, cn_shipped_at, kr_inspected_at,
  inspection_id, sent_at, delivered_at, report_due, report, credit_issued_krw, created_at, updated_at) on orders to authenticated;

-- 3) CN은 request_items 테이블을 직접 읽지 않는다(0008 컬럼 grant로 CN_VENDOR가 target_price_krw·브랜드 id를 볼 수 있었다).
--    v_request_items_cn(definer, 마스킹)만. request_images의 CN 정책은 request_items 서브쿼리 대신 definer 함수.
drop policy if exists request_items_cn on request_items;
drop policy if exists request_items_cn_update on request_items;
create or replace function cn_assigned_item(p_item uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from request_items ri where ri.id = p_item and ri.assigned_to = auth.uid())
$$;
grant execute on function cn_assigned_item(uuid) to authenticated;
drop policy if exists request_images_cn on request_images;
create policy request_images_cn on request_images for select to authenticated using (is_cn() and cn_assigned_item(request_item_id));

-- 4) brand_members_owner_insert: 자기 테이블 서브쿼리 → 재귀. 멤버 추가는 서버 액션(서비스 롤) 전용.
drop policy if exists brand_members_owner_insert on brand_members;
revoke insert, update, delete on brand_members from authenticated;

-- 5) 재제안(PRD D15): 활성 제안만 유일. 만료·거절 뒤 같은 (상품, 브랜드, 항목)으로 다시 발행 가능
alter table offers drop constraint if exists offers_product_id_brand_id_request_item_id_key;
create unique index if not exists offers_active_uq on offers (product_id, brand_id, coalesce(request_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('new','interested','hold','recheck','reconsent_pending');

-- 6) 트리거가 전이 테이블을 우회하지 않도록: 샘플 피드백 동기화는 reaction 기록, status는 반응 가능한 상태에서만
create or replace function sync_offer_reaction_from_sample() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.feedback is not null and (old.feedback is distinct from new.feedback) then
    update offers set reaction = new.feedback, reacted_at = now(),
      status = case when status in ('new','interested','hold','declined') then new.feedback::text::offer_status else status end
    where id = new.offer_id;
  end if;
  return new;
end $$;

-- 7) cn_questions: 정책을 배정 항목·같은 브랜드로 좁힌다(0008이 insert를 revoke했지만 정책도 맞춰 둔다). 게이트 기본값.
drop policy if exists cn_questions_cn_insert on cn_questions;
create policy cn_questions_cn_insert on cn_questions for insert to authenticated
  with check (is_cn() and asked_by = auth.uid() and exists (
    select 1 from request_items ri where ri.id = cn_questions.request_item_id and ri.assigned_to = auth.uid() and ri.brand_id = cn_questions.brand_id));
alter table cn_questions alter column admin_gate_until set default now() + interval '4 hours';

-- 8) 브랜드 뷰: hidden/rejected 상품의 하위 데이터 차단, recheck 제안 가림(PRD D16), 옵션 jsonb에서 원가 키 제거
create or replace function strip_cost_keys(j jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(e - 'unit_cost_cny' - 'cost_cny' - 'cost'), '[]'::jsonb) from jsonb_array_elements(coalesce(j, '[]'::jsonb)) e
$$;

create or replace view v_products_brand with (security_invoker = false) as
select
  p.id, p.code, p.status, p.category, p.name_ko, p.desc_ko, p.fabric, p.origin, p.care_codes,
  case when p.show_quality_note then p.quality_note_ko end as quality_note_ko,
  p.supply_type, p.lead_days, p.production_moq, p.min_qty, p.sample_ok,
  p.verified_in_person, p.verified_at,
  coalesce(p.hold_override, v.default_hold) as hold,
  strip_cost_keys(coalesce(p.label_options_override, v.default_label_options)) as label_options,   -- 옵션 단가는 발행 시 offers에 KRW로 고정(5단계)
  strip_cost_keys(coalesce(p.mod_options_override, v.default_mod_options)) as mod_options
from products p
left join vendors v on v.id = p.vendor_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = p.id and o.brand_id in (select auth_brand_ids()) and o.status <> 'recheck');

create or replace view v_offers_brand with (security_invoker = true) as
select
  o.id, o.product_id, o.brand_id, o.request_item_id, o.type, o.status, o.reaction, o.decline_reason, o.decline_note,
  o.price_tiers, o.fee_rate, o.sample_fee_product_krw, o.valid_until, o.exclusive_until, o.issued_at, o.reacted_at, o.admin_comment, o.owner_role, o.due_at
from offers o
where o.brand_id in (select auth_brand_ids()) and o.status <> 'recheck';

create or replace view v_product_images_brand with (security_invoker = false) as
select i.id, i.product_id, i.storage_path, i.kind, i.source, i.usable_for_sales, i.sort_order, i.color_id
from product_images i join products p on p.id = i.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = i.product_id and o.brand_id in (select auth_brand_ids()) and o.status <> 'recheck');

create or replace view v_product_colors_brand with (security_invoker = false) as
select c.id, c.product_id, c.name_ko, c.hex, c.sort_order
from product_colors c join products p on p.id = c.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = c.product_id and o.brand_id in (select auth_brand_ids()) and o.status <> 'recheck');

create or replace view v_product_sizes_brand with (security_invoker = false) as
select s.id, s.product_id, s.label, s.measurements, s.source, s.sort_order
from product_sizes s join products p on p.id = s.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = s.product_id and o.brand_id in (select auth_brand_ids()) and o.status <> 'recheck');

create or replace view v_product_variants_brand with (security_invoker = false) as
select pv.id, pv.product_id, pv.color_id, pv.size_id
from product_variants pv join products p on p.id = pv.product_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = pv.product_id and o.brand_id in (select auth_brand_ids()) and o.status <> 'recheck');

revoke all on v_offers_brand, v_products_brand, v_product_images_brand, v_product_colors_brand, v_product_sizes_brand, v_product_variants_brand from anon;
grant select on v_offers_brand, v_products_brand, v_product_images_brand, v_product_colors_brand, v_product_sizes_brand, v_product_variants_brand to authenticated;

-- 9) 인덱스 (RLS 함수·뷰가 매 행마다 치는 경로)
create index if not exists brand_members_profile_idx on brand_members(profile_id);
create index if not exists products_created_by_idx on products(created_by);
create index if not exists offers_request_item_idx on offers(request_item_id);
create index if not exists offers_product_brand_idx on offers(product_id, brand_id);
create index if not exists order_lines_order_idx on order_lines(order_id);
create index if not exists sample_items_request_idx on sample_items(sample_request_id);
create index if not exists product_images_product_idx on product_images(product_id);
create index if not exists request_items_request_idx on request_items(request_id);
create index if not exists request_items_assigned_idx on request_items(assigned_to) where assigned_to is not null;
create index if not exists request_images_item_idx on request_images(request_item_id);
create index if not exists brand_invites_token_idx on brand_invites(token);
create index if not exists notifications_recipient_idx on notifications(recipient_id, read_at, created_at);

-- down
-- grant select on offers, orders to authenticated;
-- (request_items_cn / request_items_cn_update / brand_members_owner_insert 정책은 0003 정의로 복원)
-- drop index offers_active_uq; alter table offers add unique (product_id, brand_id, request_item_id);
-- 뷰는 0004 정의로 복원; drop function strip_cost_keys(jsonb), cn_assigned_item(uuid);
