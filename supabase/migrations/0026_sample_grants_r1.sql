-- 0026 샘플 권한 보강 (별도 커밋, 6단계 리뷰 1). sample_requests 테이블 직접 조회에서 CN 운송장(cn_tracking)이 보였다.
-- v_sample_requests_brand와 같은 컬럼만 grant. v_sample_items_cn에 항목 출고 정보 추가.

revoke select on sample_requests from authenticated;
grant select (id, brand_id, requested_by, status, owner_role, due_at, ship_to, logistics_fee_krw, product_fee_total_krw,
  payment_required, payment_reported_at, payment_confirmed_at, payment_note, cn_shipped_at, kr_arrived_at, inspected_at,
  kr_tracking, sent_at, delivered_at, feedback_due, return_due, created_at, updated_at) on sample_requests to authenticated;

-- CN 뷰: 항목 단위 출고 상태 (뒤에 컬럼 추가 — create or replace는 끝에만 붙일 수 있다)
create or replace view v_sample_items_cn with (security_invoker = false) as
select si.id, si.sample_request_id, si.offer_id, si.variant_id, si.qty, si.status, si.feedback, si.feedback_reason, si.feedback_note_zh,
  sr.status as request_status, sr.payment_required, sr.payment_confirmed_at, sr.cn_tracking, sr.cn_shipped_at, sr.due_at, sr.created_at as requested_at,
  p.id as product_id, p.code as product_code, p.name_zh, pc.name_zh as color_zh, ps.label as size_label,
  case when auth_role() = 'CN_SOURCER' then b.name else 'Brand #' || left(sr.brand_id::text, 4) end as brand_label,
  si.cn_tracking as item_cn_tracking, si.cn_shipped_at as item_cn_shipped_at
from sample_items si
join sample_requests sr on sr.id = si.sample_request_id
join offers o on o.id = si.offer_id
join products p on p.id = o.product_id
join brands b on b.id = sr.brand_id
left join product_variants pv on pv.id = si.variant_id
left join product_colors pc on pc.id = pv.color_id
left join product_sizes ps on ps.id = pv.size_id
where p.created_by = auth.uid() or is_admin();

-- down
-- revoke select on sample_requests from authenticated; grant select on sample_requests to authenticated;
-- (v_sample_items_cn은 0022 정의로)
