-- 0036 브랜드 검품 리포트 뷰 (뷰·권한 — 별도 커밋). PRD D14 / DECISIONS r5-6.
-- 본품(bulk) 검품은 관리자가 kr_inspecting → sent_to_brand로 넘긴 뒤부터 보인다. inspected_by·template_id·photos(원본 경로) 제외.
-- 샘플 검품은 B-06 샘플 상세가 sample_items 결과로 이미 보여주므로 여기서는 본품만 노출한다.
create or replace view v_inspections_brand with (security_invoker = false) as
select i.id, i.type, i.target_id, i.brand_id, i.results, i.defect_qty, i.info_match_rate, i.inspected_at
from inspections i
join orders o on o.id = i.target_id and o.brand_id = i.brand_id
where i.type = 'bulk'
  and o.status in ('sent_to_brand', 'delivered', 'report_done')
  and (is_admin() or i.brand_id in (select auth_brand_ids()));

revoke all on v_inspections_brand from anon;
grant select on v_inspections_brand to authenticated;

-- down
-- drop view if exists v_inspections_brand;
