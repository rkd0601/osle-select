-- 0020 Cowork 3라운드 리뷰 (RLS·권한·트리거 — 별도 커밋). 0018·0019는 개발(6단계)용으로 비워 둔다.
-- 되돌리기: 맨 아래 "-- down".

-- 1) CN 세션이 offers 테이블을 직접 읽으면 brand_id·한국어 거절 메모·KRW 가격(→ 녹인 마진 역산)이 보였다 (r3 리뷰 2).
--    CN은 offers를 직접 읽을 필요가 없다(코멘트·샘플·발주 라인은 아래 definer 함수로 소유 판정). 정책 삭제.
create or replace function cn_owns_offer(p_offer uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from offers o join products p on p.id = o.product_id where o.id = p_offer and p.created_by = auth.uid())
$$;
grant execute on function cn_owns_offer(uuid) to authenticated;

drop policy if exists offers_cn on offers;

drop policy if exists sample_items_cn on sample_items;
create policy sample_items_cn on sample_items for select to authenticated using (is_cn() and cn_owns_offer(offer_id));

drop policy if exists order_lines_cn on order_lines;
create policy order_lines_cn on order_lines for select to authenticated using (is_cn() and cn_owns_offer(offer_id));
drop policy if exists order_lines_cn_update on order_lines;
create policy order_lines_cn_update on order_lines for update to authenticated using (is_cn() and cn_owns_offer(offer_id)) with check (is_cn());

drop policy if exists comments_cn on comments;
create policy comments_cn on comments for select to authenticated using (
  is_cn() and visibility = 'cn' and (
    (target_type = 'offer' and cn_owns_offer(target_id))
    or (target_type = 'request_item' and cn_assigned_item(target_id))
    or (target_type = 'product' and exists (select 1 from products p where p.id = comments.target_id and p.created_by = auth.uid()))
  )
);

-- 2) 발행 트리거는 코드 발급만. 상품 reviewed/repool → offering 은 앱(applyTransition: 전이 검사 + SLA + 감사 로그)이 한다 (r3 리뷰 3, 절대 규칙 4·12).
create or replace function on_offer_issued() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update products set code = coalesce(code, next_product_code()) where id = new.product_id and code is null;
  return new;
end $$;

-- 3) issue_offer_locked 실행 권한을 명시 (호스팅 기본 권한에 기대지 않는다) (r3 리뷰 5)
grant execute on function issue_offer_locked(jsonb) to service_role;

-- down
-- drop policy comments_cn / order_lines_cn(_update) / sample_items_cn → 0017·0003 정의로 복원; create policy offers_cn … (0003:113)
-- on_offer_issued → 0006 정의로 복원; drop function cn_owns_offer(uuid)
