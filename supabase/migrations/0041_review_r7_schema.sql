-- 0041 독립 리뷰(8·9단계) 반영 — 스키마·함수.
-- 1) 발주별 크레딧 사용을 차감과 같은 트랜잭션에 기록 (리뷰 MED-3): 감사 로그로 "썼는지"를 추론하면, 차감 뒤 로그 전에 죽거나
--    rebuildInvoice가 동시에 두 번 돌 때 크레딧이 두 번 빠진다. orders.credit_used_krw가 null일 때만 차감·기록, 아니면 기존 값.
alter table orders add column if not exists credit_used_krw integer;
-- 기존 확정 건은 감사 로그(order.confirm·order.invoice_rebuild 최신)의 credit_used로 채운다
update orders o set credit_used_krw = coalesce((
  select (a.diff ->> 'credit_used')::int from audit_logs a
  where a.entity = 'order' and a.entity_id = o.id and a.action in ('order.confirm', 'order.invoice_rebuild')
  order by a.created_at desc limit 1), credit_used_krw)
where o.credit_used_krw is null and o.invoice_snapshot is not null;

create or replace function use_brand_credit_for_order(p_order uuid, p_max integer) returns integer language plpgsql security definer set search_path = public as $$
declare prev integer; b uuid; bal integer; used integer;
begin
  select credit_used_krw, brand_id into prev, b from orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if prev is not null then return prev; end if;
  select credit_balance_krw into bal from brands where id = b for update;
  used := greatest(0, least(coalesce(bal, 0), coalesce(p_max, 0)));
  if used > 0 then update brands set credit_balance_krw = credit_balance_krw - used where id = b; end if;
  update orders set credit_used_krw = used where id = p_order;
  return used;
end $$;
revoke all on function use_brand_credit_for_order(uuid, integer) from public, anon, authenticated;
grant execute on function use_brand_credit_for_order(uuid, integer) to service_role;

-- 2) 즉시 알림 발송 임대 (리뷰 LOW-4): 선점한 워커가 보내는 동안 다른 워커가 같은 행을 다시 잡지 않게
alter table notifications add column if not exists delivery_claimed_at timestamptz;

-- down
-- drop function if exists use_brand_credit_for_order(uuid, integer);
-- alter table orders drop column if exists credit_used_krw; alter table notifications drop column if exists delivery_claimed_at;
