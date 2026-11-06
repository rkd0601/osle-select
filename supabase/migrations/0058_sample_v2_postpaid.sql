-- 0058 샘플 v2 — 무료 샘플 · 물류비 후불 (COWORK_DECISIONS d-26 · NEXT §0-l S1·S2). 데이터만 — 스키마·RLS·뷰 변경 없음.
-- 입금 대기 단계를 없앤다: 남아 있는 awaiting_payment 요청서를 출고 준비(requested, CN 차례 · 기본 cn_ship_days 3일)로 옮기고 후불로 바꾼다.
-- 이미 입금 신고·확인된 값(payment_reported_at·payment_confirmed_at)은 지우지 않는다(기록). 전이는 감사 로그에 남긴다.
-- enum 값 'awaiting_payment'은 지우지 않는다(Postgres enum 값 삭제는 되돌리기 어렵다) — lib/transitions.ts가 들어가는 간선을 막는다.
-- 샘플 구매가(sample_items.product_price_krw)는 새 요청서부터 "공급가 + 소량 비율"로 고정된다(lib/pricing.samplePurchasePriceKrw).
-- 아직 결정 전(return_status due · charge none)인 기존 항목은 같은 공식으로 다시 매긴다 — 예전 값은 "미회수 상품가"(수수료 전)라
-- 화면의 "구매할게요 ₩n · 공급가 + 소량 10%"와 맞지 않는다. 구매·청구·반납이 끝난 항목은 건드리지 않는다(확정 값). 감사 로그 diff에 이전 값.

with moved as (
  update sample_requests
     set status = 'requested', payment_required = false, owner_role = 'CN', due_at = now() + interval '3 days', updated_at = now()
   where status = 'awaiting_payment'
  returning id, brand_id
)
insert into audit_logs (actor_id, action, entity, entity_id, diff)
select null, 'transition', 'sample_request', id, jsonb_build_object('from', 'awaiting_payment', 'to', 'requested', 'by', '0058_sample_v2_postpaid', 'brand_id', brand_id)
from moved;

-- 결정 전 항목의 구매가 다시 매기기: ceil10(ceil10(최소 수량 구간 상품가 × (1 + 수수료)) × (1 + 소량 비율)) — lib/pricing.ts와 같은 10원 올림
with markup as (
  select coalesce((select (value #>> '{}')::numeric from settings where key = 'sample_purchase_markup'), 0.1) as m
), priced as (
  select si.id, si.sample_request_id, si.product_price_krw as before,
         (ceil(round(ceil(round(t.p * (1 + coalesce(o.fee_rate, 0)) * 100) / 1000) * 10 * (1 + (select m from markup)) * 100) / 1000) * 10)::int as after
  from sample_items si
  join offers o on o.id = si.offer_id
  cross join lateral (
    select (x->>'product_price_krw')::numeric as p from jsonb_array_elements(o.price_tiers) x order by (x->>'min_qty')::int limit 1
  ) t
  where si.return_status = 'due' and si.charge_status = 'none' and jsonb_typeof(o.price_tiers) = 'array'
), changed as (
  update sample_items si set product_price_krw = priced.after
  from priced where si.id = priced.id and priced.after > 0 and si.product_price_krw is distinct from priced.after
  returning si.id, priced.before, priced.after
)
insert into audit_logs (actor_id, action, entity, entity_id, diff)
select null, 'sample.reprice', 'sample_item', id, jsonb_build_object('before', before, 'after', after, 'by', '0058_sample_v2_postpaid')
from changed;

-- 요청서 합(구매하면 더해질 금액) 다시: 항목 수량 × 구매가
update sample_requests sr set product_fee_total_krw = s.total
from (select sample_request_id, sum(qty * coalesce(product_price_krw, 0))::int as total from sample_items group by sample_request_id) s
where s.sample_request_id = sr.id and sr.status not in ('closed', 'cancelled') and sr.product_fee_total_krw is distinct from s.total;

-- down (자동 되돌리기 없음 — 옮긴 행은 감사 로그 diff.by = '0058_sample_v2_postpaid'로 찾는다)
-- update sample_requests sr set status = 'awaiting_payment', payment_required = true, owner_role = 'BRAND'
--  where sr.status = 'requested' and exists (select 1 from audit_logs a where a.entity = 'sample_request' and a.entity_id = sr.id and a.diff->>'by' = '0058_sample_v2_postpaid');
