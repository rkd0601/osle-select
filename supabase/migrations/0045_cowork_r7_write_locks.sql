-- 0045 Cowork 7라운드 (권한·RLS — 별도 커밋). comments 쓰기 차단·CN 질문 선택지 순서는 개발 0042가 먼저 반영 → 여기선 brand_applications만.
-- brand_applications: anon 키로 PostgREST에 직접 insert 가능(0003 `with check (true)` + 0005 grant) → 신청 폼 서버 액션(서비스 롤)만.
--   스팸·PII 덤프뿐 아니라 channels에 배열 아닌 JSON을 넣으면 A-07 화면이 깨진다.
revoke insert, update, delete on brand_applications from anon, authenticated;
drop policy if exists brand_applications_insert on brand_applications;

-- down
-- grant insert on brand_applications to anon, authenticated;
-- create policy brand_applications_insert on brand_applications for insert to anon, authenticated with check (true);
