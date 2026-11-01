-- 0035 브랜드 크레딧 원자적 증감 (7단계 리뷰 1). read-modify-write로 동시 확정 시 크레딧 이중 사용·적립 유실이 났다.
-- 서비스 롤 전용 함수. 금액은 정수 KRW.

-- 적립: +amount, 새 잔액 반환
create or replace function credit_brand(p_brand uuid, p_amount integer) returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if p_amount < 0 then raise exception 'negative_credit' using errcode = 'P0001'; end if;
  update brands set credit_balance_krw = credit_balance_krw + p_amount where id = p_brand returning credit_balance_krw into v;
  return v;
end $$;

-- 사용: 잔액과 p_max 중 작은 값만큼 차감, 실제 사용액 반환 (행 잠금으로 동시 사용 방지)
create or replace function use_brand_credit(p_brand uuid, p_max integer) returns integer language plpgsql security definer set search_path = public as $$
declare bal integer; used integer;
begin
  select credit_balance_krw into bal from brands where id = p_brand for update;
  used := greatest(0, least(coalesce(bal, 0), coalesce(p_max, 0)));
  if used > 0 then update brands set credit_balance_krw = credit_balance_krw - used where id = p_brand; end if;
  return used;
end $$;

revoke all on function credit_brand(uuid, integer) from public, anon, authenticated;
revoke all on function use_brand_credit(uuid, integer) from public, anon, authenticated;
grant execute on function credit_brand(uuid, integer) to service_role;
grant execute on function use_brand_credit(uuid, integer) to service_role;

-- down
-- drop function if exists credit_brand(uuid, integer); drop function if exists use_brand_credit(uuid, integer);
