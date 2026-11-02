-- 0052 slug 변경 승인을 한 트랜잭션으로 (DECISIONS r10-1). 요청 닫기 + brands.slug 교체(옛 주소가 그대로일 때만) + 감사 로그.
-- 실패(중복 23505 · 쿨다운 P0001 slug_cooling_down · 요청이 이미 닫힘 stale_request · slug가 미리 바뀜 stale_slug)는 전부 롤백되어
-- 요청은 pending, slug는 그대로 남는다 — 코드의 2단계 로직(닫기 → 교체 → 복원)을 대체한다. 서비스 롤 전용.
create or replace function approve_slug_change(p_request uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_brand uuid; v_new text; v_old text; v_rows int;
begin
  -- 1) 요청 행을 먼저 조건부로 닫는다(브랜드가 그 사이 취소했으면 0행)
  select r.brand_id, r.value into v_brand, v_new
    from brand_change_requests r where r.id = p_request and r.kind = 'slug' and r.status = 'pending' for update;
  if v_brand is null then raise exception 'stale_request' using errcode = 'P0002'; end if;
  select slug into v_old from brands where id = v_brand for update;
  if v_old is null then raise exception 'stale_request' using errcode = 'P0002'; end if;
  if v_old = v_new then raise exception 'stale_slug' using errcode = 'P0003'; end if;

  update brand_change_requests
     set status = 'approved', decided_by = p_actor, decided_at = now(), previous_value = v_old
   where id = p_request and status = 'pending';

  -- 2) slug 교체 — 조회 시점의 옛 주소가 그대로일 때만(그 사이 바뀌었으면 previous_value가 틀어지므로 중단)
  update brands set slug = v_new, updated_at = now() where id = v_brand and slug = v_old;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'stale_slug' using errcode = 'P0003'; end if;

  -- 3) 감사 로그 (절대 규칙 12). 알림은 코드가 커밋 뒤에 보낸다.
  insert into audit_logs(actor_id, action, entity, entity_id, diff)
    values (p_actor, 'brand.slug_change', 'brand', v_brand, jsonb_build_object('from', v_old, 'to', v_new, 'request_id', p_request));
  return jsonb_build_object('brand_id', v_brand, 'from', v_old, 'to', v_new);
end $$;
revoke all on function approve_slug_change(uuid, uuid) from public, anon, authenticated;

-- down
-- drop function if exists approve_slug_change(uuid, uuid);
