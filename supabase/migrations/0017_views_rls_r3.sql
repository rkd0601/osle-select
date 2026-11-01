-- 0017 뷰·RLS (별도 커밋). COWORK_DECISIONS Q6 + 5단계 리뷰 1·2·9.

-- Q6 / 리뷰 1: 브랜드는 옵션을 offers.option_prices(KRW, 발행 시 고정)로만 본다. v_products_brand의 label_options/mod_options 제거
--   (원청 자유 입력·원가 키가 PostgREST로 직접 읽히던 경로 차단). 컬럼 삭제는 create or replace로 안 되므로 drop/create.
drop view if exists v_products_brand;
create view v_products_brand with (security_invoker = false) as
select
  p.id, p.code, p.status, p.category, p.name_ko, p.desc_ko, p.fabric, p.origin, p.care_codes,
  case when p.show_quality_note then p.quality_note_ko end as quality_note_ko,
  p.supply_type, p.lead_days, p.production_moq, p.min_qty, p.sample_ok,
  p.verified_in_person, p.verified_at,
  coalesce(p.hold_override, v.default_hold) as hold
from products p
left join vendors v on v.id = p.vendor_id
where p.status in ('offering','repool','recheck')
  and exists (select 1 from offers o where o.product_id = p.id and (is_admin() or o.brand_id in (select auth_brand_ids())) and o.status <> 'recheck');
revoke all on v_products_brand from anon;
grant select on v_products_brand to authenticated;

-- 리뷰 2: CN 코멘트는 모든 CN이 아니라 관련 CN만 — 본인 상품에 걸린 제안, 본인 배정 항목. (CN_VENDOR가 다른 원청 상품의 브랜드 반응을 보던 문제)
drop policy if exists comments_cn on comments;
create policy comments_cn on comments for select to authenticated using (
  is_cn() and visibility = 'cn' and (
    (target_type = 'offer' and exists (select 1 from offers o join products p on p.id = o.product_id where o.id = comments.target_id and p.created_by = auth.uid()))
    or (target_type = 'request_item' and cn_assigned_item(target_id))
  )
);

-- 리뷰 9: 브랜드가 offers 테이블을 직접 읽어도 재확인 중(D16 "가려진다") 제안은 보이지 않게
drop policy if exists offers_brand on offers;
create policy offers_brand on offers for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()) and status <> 'recheck');

-- down
-- (v_products_brand는 0015 정의로, comments_cn·offers_brand는 0003 정의로 복원)
