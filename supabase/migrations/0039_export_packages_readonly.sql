-- 0039 쇼핑몰 패키지 행은 서버 액션(서비스 롤)만 쓴다 (RLS·권한 — 별도 커밋). 9단계 B-12.
-- 0003 정책이 for all이라 브랜드 세션이 files(경로)를 마음대로 넣은 행을 만들 수 있었다 → 화면이 그 경로에 서명 URL을 발급하면
-- 다른 브랜드 파일이 새어 나갈 수 있다. 읽기만 남기고 쓰기 권한을 닫는다(화면도 자기 브랜드 접두어 경로만 서명).
drop policy if exists export_packages_brand on export_packages;
create policy export_packages_brand on export_packages for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
revoke insert, update, delete on export_packages from authenticated;

-- down
-- drop policy if exists export_packages_brand on export_packages;
-- create policy export_packages_brand on export_packages for all to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
-- grant insert, update, delete on export_packages to authenticated;
