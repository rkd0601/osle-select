-- 0049 옛 slug 90일 재사용 금지 (DECISIONS r8-5: 리다이렉트는 두지 않고, 승인으로 풀린 옛 주소를 다른 브랜드가 90일간 못 쓴다).
-- brand_change_requests.previous_value = 승인 시점의 옛 slug. brands insert/update 때 트리거가 대조한다(코드 검사와 이중).
alter table brand_change_requests add column if not exists previous_value text;

create or replace function assert_slug_not_cooling() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then return new; end if;
  if exists (
    select 1 from brand_change_requests r
    where r.kind = 'slug' and r.status = 'approved' and r.previous_value = new.slug
      and r.brand_id <> new.id and r.decided_at > now() - interval '90 days'
  ) then
    raise exception 'slug_cooling_down' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function assert_slug_not_cooling() from public, anon, authenticated;
drop trigger if exists trg_brands_slug_cooldown on brands;
create trigger trg_brands_slug_cooldown before insert or update of slug on brands for each row execute function assert_slug_not_cooling();

-- down
-- drop trigger if exists trg_brands_slug_cooldown on brands;
-- drop function if exists assert_slug_not_cooling();
-- alter table brand_change_requests drop column if exists previous_value;
