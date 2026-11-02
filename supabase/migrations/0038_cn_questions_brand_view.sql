-- 0038 CN 질문 브랜드 노출 (뷰·권한·RLS — 별도 커밋). 8단계 A-02 / PRD D17.
-- 0003의 브랜드 정책은 테이블 전체 컬럼(body_zh·answer_zh·options의 zh)을 읽게 하고, update도 모든 컬럼에 열려 있었다(규칙 1 *_zh, 규칙 "쓰기는 서버 액션").
-- → 브랜드는 v_cn_questions_brand(한국어만)로 읽고, 답변은 서버 액션(서비스 롤)으로만. CN 정책(본인 질문)은 그대로.
drop policy if exists cn_questions_brand on cn_questions;
drop policy if exists cn_questions_brand_answer on cn_questions;

create or replace view v_cn_questions_brand with (security_invoker = false) as
select q.id, q.request_item_id, q.brand_id, q.body_ko,
  coalesce((select jsonb_agg(o -> 'ko') from jsonb_array_elements(q.options) o), '[]'::jsonb) as options_ko,
  q.released_at, q.answer, q.answered_at, q.created_at
from cn_questions q
where q.released_at is not null
  and (is_admin() or q.brand_id in (select auth_brand_ids()));

revoke all on v_cn_questions_brand from anon;
grant select on v_cn_questions_brand to authenticated;

-- down
-- drop view if exists v_cn_questions_brand;
-- create policy cn_questions_brand on cn_questions for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()) and released_at is not null);
-- create policy cn_questions_brand_answer on cn_questions for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids()) and released_at is not null) with check (is_brand() and brand_id in (select auth_brand_ids()));
