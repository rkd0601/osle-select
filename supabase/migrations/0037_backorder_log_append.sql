-- 0037 미송 기록 append 함수 (7단계 r5 리뷰 11). 브랜드 선택·관리자 갱신이 read-modify-write로 backorder_log를 덮어써
-- 동시에 쓰면 한쪽 기록이 사라졌다 → jsonb 배열 끝에 원자적으로 붙인다. 서비스 롤 전용.
-- p_require_status가 있으면 그 미송 상태일 때만 붙인다(브랜드 선택은 backordered일 때만). 붙였으면 true.
create or replace function append_backorder_log(p_line uuid, p_entry jsonb, p_require_status backorder_status default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p_entry) <> 'object' then raise exception 'entry_not_object' using errcode = 'P0001'; end if;
  update order_lines
     set backorder_log = coalesce(backorder_log, '[]'::jsonb) || jsonb_build_array(p_entry)
   where id = p_line and (p_require_status is null or backorder_status = p_require_status);
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function append_backorder_log(uuid, jsonb, backorder_status) from public, anon, authenticated;
grant execute on function append_backorder_log(uuid, jsonb, backorder_status) to service_role;

-- down
-- drop function if exists append_backorder_log(uuid, jsonb, backorder_status);
