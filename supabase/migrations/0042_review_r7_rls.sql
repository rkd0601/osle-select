-- 0042 독립 리뷰(8·9단계) 반영 — RLS·뷰·권한 (별도 커밋).
-- 1) comments 직접 쓰기 차단 (리뷰 MED-1): 0003 insert 정책은 대상 소유를 보지 않아, CN이 남의 배정 항목에·브랜드가 남의 발주에
--    코멘트를 꽂을 수 있었다(위아더 명의로 보임). 쓰기는 addComment(서비스 롤 + 소유 확인)만.
drop policy if exists comments_brand_insert on comments;
drop policy if exists comments_cn_insert on comments;
revoke insert, update, delete on comments from authenticated;

-- 2) 브랜드 CN 질문 뷰: 선택지 순서 보장 (리뷰 LOW-9) — 브랜드가 고른 번호를 서버가 options[i]로 되돌린다
create or replace view v_cn_questions_brand with (security_invoker = false) as
select q.id, q.request_item_id, q.brand_id, q.body_ko,
  coalesce((select jsonb_agg(o.v -> 'ko' order by o.n) from jsonb_array_elements(q.options) with ordinality as o(v, n)), '[]'::jsonb) as options_ko,
  q.released_at, q.answer, q.answered_at, q.created_at
from cn_questions q
where q.released_at is not null
  and (is_admin() or q.brand_id in (select auth_brand_ids()));

-- down
-- create policy comments_brand_insert on comments for insert to authenticated with check (is_brand() and visibility = 'brand' and brand_id in (select auth_brand_ids()) and author_id = auth.uid());
-- create policy comments_cn_insert on comments for insert to authenticated with check (is_cn() and visibility = 'cn' and author_id = auth.uid());
-- grant insert on comments to authenticated; (뷰는 0038 정의로)
