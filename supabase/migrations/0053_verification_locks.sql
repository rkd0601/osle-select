-- 0053 전체 검증(2026-11-04) 반영 — RLS·권한·함수만 (별도 커밋). 되돌리기: 맨 아래 "-- down".

-- 1) brand_invites: 브랜드 owner가 PostgREST로 직접 insert하면 level='owner'·can_purchase·만료를 마음대로 넣을 수 있었다
--    (0007 정책이 level을 보지 않음 → "owner 초대는 ADMIN만" 코드 가드 우회). 초대 생성은 이미 서버 액션(서비스 롤)뿐이다.
revoke insert, update, delete on brand_invites from authenticated;
drop policy if exists brand_invites_owner_insert on brand_invites;

-- 2) inspections: 브랜드가 테이블을 직접 읽으면 공개 전(kr_inspecting) 결과·사진 경로·검품자 id가 보였다(0003 정책 + 0005 전체 컬럼 grant).
--    브랜드는 v_inspections_brand(0036, definer)만, ADMIN은 서비스 롤 — 테이블 select 자체를 닫는다.
revoke select on inspections from authenticated;
drop policy if exists inspections_brand on inspections;

-- 3) 불량 크레딧 발행을 한 트랜잭션으로 — 관리자 둘이 동시에 누르면 credit_brand가 두 번 실행돼 잔액이 2배로 적립됐다.
--    orders 행 잠금 → credit_issued_krw = 0일 때만 적립 + 표시 + 감사. 이미 발행됐으면 'already_credited'.
create or replace function issue_order_credit(p_order uuid, p_amount integer, p_actor uuid, p_suggested integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_brand uuid; v_status text; v_issued integer; v_balance integer;
begin
  if p_amount < 0 then raise exception 'negative_credit' using errcode = 'P0001'; end if;
  select brand_id, status::text, credit_issued_krw into v_brand, v_status, v_issued from orders where id = p_order for update;
  if v_brand is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status <> 'report_done' or v_issued > 0 then raise exception 'already_credited' using errcode = 'P0003'; end if;
  if p_amount > 0 then
    update brands set credit_balance_krw = credit_balance_krw + p_amount where id = v_brand returning credit_balance_krw into v_balance;
  end if;
  update orders set credit_issued_krw = p_amount where id = p_order;
  insert into audit_logs(actor_id, action, entity, entity_id, diff)
    values (p_actor, 'order.credit', 'order', p_order, jsonb_build_object('credit_krw', p_amount, 'suggested_krw', p_suggested, 'brand_id', v_brand));
  return jsonb_build_object('brand_id', v_brand, 'credit', p_amount, 'balance', v_balance);
end $$;
revoke all on function issue_order_credit(uuid, integer, uuid, integer) from public, anon, authenticated;
grant execute on function issue_order_credit(uuid, integer, uuid, integer) to service_role;

-- down
-- grant insert on brand_invites to authenticated; (0007 정책 복원)
-- grant select on inspections to authenticated; (0003 inspections_brand 정책 복원)
-- drop function if exists issue_order_credit(uuid, integer, uuid, integer);
