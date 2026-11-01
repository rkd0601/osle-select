-- 0034 알림 권한 (별도 커밋). 0005는 notifications에 insert/update 전체를 줬다 → 본인 행의 read_at만 바꿀 수 있게.
-- 알림 생성은 서버(notify, 서비스 롤)만. 발송 기록·오류는 사용자에게 보일 필요 없다.
revoke insert, update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;
revoke select on notifications from authenticated;
grant select (id, recipient_id, kind, type, title, body, link_path, read_at, created_at, entity, entity_id) on notifications to authenticated;

-- profiles: 수신 설정은 본인이 바꿀 수 있게 (RLS profiles_self_update가 행을 제한)
grant update (notify_digest) on profiles to authenticated;

revoke all on sla_alerts from anon, authenticated;

-- down
-- grant select, insert, update on notifications to authenticated; revoke update (notify_digest) on profiles from authenticated;
