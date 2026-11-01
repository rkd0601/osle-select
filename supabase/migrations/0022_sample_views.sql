-- 0022 샘플 뷰·권한 (별도 커밋). 브랜드는 v_sample_*_brand, CN은 v_sample_items_cn(브랜드 마스킹)만.
-- 내부 메모(inspection_note_internal)와 CN용 번역(feedback_note_zh)은 브랜드 응답에 없다. CN은 브랜드 원문(feedback_note)을 못 본다.

-- 테이블 직접 조회도 컬럼 단위로 (0008·0010과 같은 방식)
revoke select on sample_items from authenticated;
grant select (id, sample_request_id, brand_id, offer_id, variant_id, qty, status, feedback, feedback_note, feedback_reason,
  return_status, returned_at, return_tracking, return_requested_at, charge_status, charged_krw, charged_at, deducted_in_order_id,
  product_price_krw, inspection_photo_path, inspection_defect, inspected_at, created_at) on sample_items to authenticated;
-- CN은 테이블이 아니라 마스킹 뷰로만 (0020 sample_items_cn 정책 대체)
drop policy if exists sample_items_cn on sample_items;

create or replace view v_sample_requests_brand with (security_invoker = true) as
select sr.id, sr.brand_id, sr.requested_by, sr.status, sr.owner_role, sr.due_at, sr.ship_to, sr.logistics_fee_krw, sr.product_fee_total_krw,
  sr.payment_required, sr.payment_reported_at, sr.payment_confirmed_at, sr.payment_note, sr.cn_shipped_at, sr.kr_arrived_at, sr.inspected_at,
  sr.kr_tracking, sr.sent_at, sr.delivered_at, sr.feedback_due, sr.return_due, sr.created_at, sr.updated_at
from sample_requests sr
where is_admin() or sr.brand_id in (select auth_brand_ids());

create or replace view v_sample_items_brand with (security_invoker = true) as
select si.id, si.sample_request_id, si.brand_id, si.offer_id, si.variant_id, si.qty, si.status, si.feedback, si.feedback_note, si.feedback_reason,
  si.return_status, si.returned_at, si.return_tracking, si.return_requested_at, si.charge_status, si.charged_krw, si.charged_at, si.product_price_krw,
  si.inspection_photo_path, si.inspection_defect, si.inspected_at, si.created_at
from sample_items si
where is_admin() or si.brand_id in (select auth_brand_ids());

-- CN: 본인 상품의 샘플 라인만. CN_VENDOR는 브랜드명 마스킹. 피드백은 zh 번역만. 브랜드 수령 주소 없음(CN은 위아더로 보낸다).
create or replace view v_sample_items_cn with (security_invoker = false) as
select si.id, si.sample_request_id, si.offer_id, si.variant_id, si.qty, si.status, si.feedback, si.feedback_reason, si.feedback_note_zh,
  sr.status as request_status, sr.payment_required, sr.payment_confirmed_at, sr.cn_tracking, sr.cn_shipped_at, sr.due_at, sr.created_at as requested_at,
  p.id as product_id, p.code as product_code, p.name_zh, pc.name_zh as color_zh, ps.label as size_label,
  case when auth_role() = 'CN_SOURCER' then b.name else 'Brand #' || left(sr.brand_id::text, 4) end as brand_label
from sample_items si
join sample_requests sr on sr.id = si.sample_request_id
join offers o on o.id = si.offer_id
join products p on p.id = o.product_id
join brands b on b.id = sr.brand_id
left join product_variants pv on pv.id = si.variant_id
left join product_colors pc on pc.id = pv.color_id
left join product_sizes ps on ps.id = pv.size_id
where p.created_by = auth.uid() or is_admin();

revoke all on v_sample_requests_brand, v_sample_items_brand, v_sample_items_cn from anon;
grant select on v_sample_requests_brand, v_sample_items_brand, v_sample_items_cn to authenticated;

-- down
-- drop view if exists v_sample_items_cn, v_sample_items_brand, v_sample_requests_brand;
-- revoke select on sample_items from authenticated; grant select on sample_items to authenticated;
-- create policy sample_items_cn on sample_items for select to authenticated using (is_cn() and cn_owns_offer(offer_id));
