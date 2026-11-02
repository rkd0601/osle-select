-- 0048 Cowork r8 리뷰 — A-08 설정 쓰기를 원자적으로 (MED-1 이력 이중 기록, LOW-1 비원자, LOW-2 계좌 비우기)
-- 되돌리기: 맨 아래 "-- down".

-- 1) settings_history 트리거: insert도 기록(신규 키 첫 저장이 이력에 없던 비대칭), 코드 쪽 history insert는 제거해 2중 기록을 없앤다.
create or replace function log_settings_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into settings_history(key, old_value, new_value, changed_by) values (new.key, null, new.value, new.updated_by);
  elsif tg_op = 'UPDATE' then
    if old.value is distinct from new.value then
      insert into settings_history(key, old_value, new_value, changed_by) values (new.key, old.value, new.value, new.updated_by);
    end if;
  elsif tg_op = 'DELETE' then
    insert into settings_history(key, old_value, new_value, changed_by) values (old.key, old.value, null, old.updated_by);
    return old;
  end if;
  return new;
end $$;
drop trigger if exists trg_settings_history on settings;
create trigger trg_settings_history after insert or update or delete on settings for each row execute function log_settings_change();

-- 2) 설정 upsert + 감사 로그를 한 트랜잭션으로. p_value null = 키 삭제(선택 목록 비우기, 예: 입금 계좌).
--    서비스 롤 전용(절대 규칙 12: 환율·마진·수수료 변경은 반드시 감사 로그와 함께).
create or replace function update_setting(p_key text, p_value jsonb, p_actor uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_exists boolean;
begin
  select value, true into v_before, v_exists from settings where key = p_key;
  v_exists := coalesce(v_exists, false);
  if (not v_exists and p_value is null) or (v_exists and v_before is not distinct from p_value) then
    return jsonb_build_object('changed', false, 'before', v_before);
  end if;
  if p_value is null then
    -- 삭제 전 updated_by를 행위자로 맞춰 이력에 남긴다
    update settings set updated_by = p_actor where key = p_key;
    delete from settings where key = p_key;
  else
    insert into settings(key, value, updated_by, updated_at) values (p_key, p_value, p_actor, now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into audit_logs(actor_id, action, entity, entity_id, diff)
    values (p_actor, p_action, 'settings', null, jsonb_build_object('key', p_key, 'before', v_before, 'after', p_value));
  return jsonb_build_object('changed', true, 'before', v_before);
end $$;
revoke all on function update_setting(text, jsonb, uuid, text) from public, anon, authenticated;

-- down
-- drop function update_setting(text, jsonb, uuid, text);
-- drop trigger trg_settings_history on settings; (0002 정의로 복원: after update만)
