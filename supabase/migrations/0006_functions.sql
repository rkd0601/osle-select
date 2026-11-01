-- 0006 DB 함수. 상품 코드 발급, 설정 조회, 제안 발행 시 상품 상태 동기화.

-- 브랜드 노출용 상품 코드: OS-26FW-0001 (연 2자리 + 시즌 + 4자리 순번). 공개(발행) 시 1회 발급.
create sequence if not exists product_code_seq;
create or replace function next_product_code(p_prefix text default 'OS', p_season text default null) returns text language plpgsql as $$
declare yy text := to_char(now(), 'YY'); season text := coalesce(p_season, case when extract(month from now()) between 3 and 8 then 'SS' else 'FW' end);
begin
  return format('%s-%s%s-%s', p_prefix, yy, season, lpad(nextval('product_code_seq')::text, 4, '0'));
end $$;

-- settings 읽기 (서버 전용, 서비스 롤)
create or replace function get_setting(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select value from settings where key = p_key
$$;
revoke all on function get_setting(text) from public, anon, authenticated;

-- 제안 발행 시: 상품 코드 발급 + 상태 offering
create or replace function on_offer_issued() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update products set code = coalesce(code, next_product_code()), status = case when status in ('reviewed','repool') then 'offering' else status end
  where id = new.product_id;
  return new;
end $$;
create trigger trg_offer_issued after insert on offers for each row execute function on_offer_issued();

-- 샘플 피드백 → 제안 반응 동기화 (PRD 4장)
create or replace function sync_offer_reaction_from_sample() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.feedback is not null and (old.feedback is distinct from new.feedback) then
    update offers set reaction = new.feedback, status = new.feedback::text::offer_status, reacted_at = now() where id = new.offer_id;
  end if;
  return new;
end $$;
create trigger trg_sample_feedback_sync after update of feedback on sample_items for each row execute function sync_offer_reaction_from_sample();

-- 상품 재확인(recheck) 시 걸린 제안 모두 recheck로
create or replace function cascade_product_recheck() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'recheck' and old.status is distinct from 'recheck' then
    update offers set status = 'recheck', owner_role = 'ADMIN', due_at = now() + interval '1 day'
    where product_id = new.id and status in ('new','interested','hold','reconsent_pending');
  end if;
  return new;
end $$;
create trigger trg_product_recheck after update of status on products for each row execute function cascade_product_recheck();

-- 요청 항목 집계: 제안이 1개 이상 발행되면 offered
create or replace function sync_request_item_on_offer() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.request_item_id is not null then
    update request_items set status = 'offered', owner_role = 'BRAND', due_at = coalesce(new.exclusive_until::timestamptz, now() + interval '14 days')
    where id = new.request_item_id and status in ('assigned','sourcing');
  end if;
  return new;
end $$;
create trigger trg_request_item_offered after insert on offers for each row execute function sync_request_item_on_offer();
