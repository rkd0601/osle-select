-- 0057 요청 링크 메타(요청 작성 v3 A3, NEXT §0-l · d-28). 되돌리기: 맨 아래 "-- down".
-- 링크 행(request_images.source_url)에 접수 뒤 서버가 가져온 og:title · og:image(요청 이미지 버킷에 내려받은 경로)를 둔다.
-- 표 권한·RLS는 request_images 그대로(0003·0005 — 표 단위 grant라 새 칼럼도 같은 범위). 원가 무관 칼럼이다.

alter table request_images add column if not exists link_title text;
alter table request_images add column if not exists link_image_path text;
alter table request_images add column if not exists link_fetched_at timestamptz;

comment on column request_images.link_title is 'og:title(없으면 <title>) — 접수 뒤 서버가 채움(A3). 실패하면 null, 화면은 도메인';
comment on column request_images.link_image_path is 'og:image를 내려받은 request-images 버킷 경로(<brand>/og/<uuid>.<ext>)';
comment on column request_images.link_fetched_at is '메타를 시도한 시각(성공·실패 모두) — 다시 시도하지 않게';

-- down
-- alter table request_images drop column if exists link_fetched_at, drop column if exists link_image_path, drop column if exists link_title;
