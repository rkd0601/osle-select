-- 0031 Cowork r4 결정 #3·#5·#6·#10 (스키마·함수). 뷰는 0032.

-- #6 샘플 피드백 → 제안 반응 트리거에 감사 로그 (actor = feedback_by — 서버 액션이 서비스 롤로 쓰므로 auth.uid()는 비어 있다)
alter table sample_items add column if not exists feedback_by uuid references profiles(id);

create or replace function sync_offer_reaction_from_sample() returns trigger language plpgsql security definer set search_path = public as $$
declare v_before offer_status; v_after offer_status;
begin
  if new.feedback is not null and (old.feedback is distinct from new.feedback) then
    select status into v_before from offers where id = new.offer_id;
    update offers set reaction = new.feedback, reacted_at = now(),
      status = case when status in ('new','interested','hold','declined') then new.feedback::text::offer_status else status end
    where id = new.offer_id
    returning status into v_after;
    insert into audit_logs (actor_id, action, entity, entity_id, diff)
    values (new.feedback_by, 'offer.reaction_from_sample', 'offer', new.offer_id,
            jsonb_build_object('sample_item_id', new.id, 'feedback', new.feedback, 'status_before', v_before, 'status_after', v_after, 'brand_id', new.brand_id));
  end if;
  return new;
end $$;

-- #10 독점 판정 날짜를 KST로 (DB 세션 TZ가 UTC면 current_date는 한국 자정~09시에 하루 늦다)
create or replace function issue_offer_locked(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_product uuid := (p->>'product_id')::uuid; v_brand uuid := (p->>'brand_id')::uuid; v_item uuid := nullif(p->>'request_item_id','')::uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform pg_advisory_xact_lock(hashtext('offer:' || v_product::text));
  if exists (select 1 from offers o where o.product_id = v_product and o.brand_id = v_brand
             and coalesce(o.request_item_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_item, '00000000-0000-0000-0000-000000000000'::uuid)
             and o.status in ('new','interested','hold','recheck','reconsent_pending')) then
    raise exception 'offer_duplicate' using errcode = 'P0001';
  end if;
  if exists (select 1 from offers o where o.product_id = v_product and o.brand_id <> v_brand
             and o.status in ('new','interested','hold','recheck','reconsent_pending') and o.exclusive_until >= v_today) then
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
grant execute on function issue_offer_locked(jsonb) to service_role;

-- #3 실적(proven) 브랜드 샘플 물류비는 발주 확정 때 함께 청구 — 어느 발주에 합산됐는지 기록(1회)
alter table sample_requests add column if not exists logistics_billed_order_id uuid references orders(id);
-- #5 미도착(unavailable) 항목 크레딧 — 관리자가 A-05에서 확정, 브랜드 크레딧 잔액에 더해져 다음 발주에서 차감
alter table sample_items add column if not exists credited_krw integer not null default 0;

-- down
-- sync_offer_reaction_from_sample · issue_offer_locked → 0010 · 0016 정의로
-- alter table sample_items drop column if exists feedback_by, drop column if exists credited_krw;
-- alter table sample_requests drop column if exists logistics_billed_order_id;
