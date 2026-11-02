-- 0044 export_snapshots RLS·권한 (별도 커밋). 쓰기는 발주 확정 서버 액션(서비스 롤)만, 브랜드는 자기 브랜드 행 읽기만.
alter table export_snapshots enable row level security;
create policy export_snapshots_admin_all on export_snapshots for all to authenticated using (is_admin()) with check (is_admin());
create policy export_snapshots_brand on export_snapshots for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
revoke all on export_snapshots from anon, authenticated;
grant select on export_snapshots to authenticated;

-- down
-- drop policy if exists export_snapshots_brand on export_snapshots;
-- drop policy if exists export_snapshots_admin_all on export_snapshots;
-- revoke all on export_snapshots from authenticated;
