-- 0047 brand_change_requests RLS·권한 (별도 커밋). 쓰기는 서버 액션(서비스 롤)만, 브랜드 멤버는 자기 브랜드 요청 읽기만.
alter table brand_change_requests enable row level security;
create policy brand_change_requests_admin_all on brand_change_requests for all to authenticated using (is_admin()) with check (is_admin());
create policy brand_change_requests_brand on brand_change_requests for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
revoke all on brand_change_requests from anon, authenticated;
grant select on brand_change_requests to authenticated;

-- down
-- drop policy if exists brand_change_requests_brand on brand_change_requests;
-- drop policy if exists brand_change_requests_admin_all on brand_change_requests;
-- revoke all on brand_change_requests from authenticated;
