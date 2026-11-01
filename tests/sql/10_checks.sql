-- 1단계 수용 기준 검증 (PRD 12장). psql -v ON_ERROR_STOP=1 로 실행. 실패하면 raise exception.
\set ON_ERROR_STOP on

-- 세션 헬퍼: 역할·사용자로 전환
create or replace function test_login(p_sub uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'app_metadata', json_build_object('role', p_role))::text, true);
end $$;

-- ---------- 1. 브랜드 역할로 원가·원청 테이블 직접 SELECT 거부 ----------
do $$
declare ok boolean := false;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  begin
    perform count(*) from product_costs;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 1a: brand could SELECT product_costs'; end if;

  ok := false;
  begin perform count(*) from vendors; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 1b: brand could SELECT vendors'; end if;

  ok := false;
  begin perform count(*) from settings; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 1c: brand could SELECT settings'; end if;

  ok := false;
  begin perform count(*) from glossary; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 1d: brand could SELECT glossary'; end if;

  -- products 테이블은 권한은 있지만 브랜드용 정책이 없어 0행 (RLS)
  if (select count(*) from products) <> 0 then raise exception 'FAIL 1e: brand sees rows in products table directly'; end if;
  reset role;
  raise notice 'PASS 1: brand cannot read product_costs/vendors/settings/glossary; products table yields 0 rows';
end $$;

-- ---------- 2. 브랜드 뷰에 금지 컬럼 없음 ----------
do $$
declare bad int;
begin
  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name in ('v_offers_brand','v_products_brand','v_product_images_brand','v_product_colors_brand','v_product_sizes_brand','v_product_variants_brand')
    and (column_name in ('cost_cny','vendor_code','hidden_margin_rate','fx_rate','weight_g','source_market','booth','tiers','vendor_id')
         or column_name like '%\_zh');
  if bad > 0 then raise exception 'FAIL 2: forbidden columns exposed in brand views (%)', bad; end if;
  raise notice 'PASS 2: brand views expose no cost/vendor/fx/hidden_margin/weight/_zh columns';
end $$;

-- ---------- 3. 브랜드 A는 자기 제안·상품만, 브랜드 B는 0행 ----------
do $$
declare n int;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER'); -- 오슬앤뮤즈
  select count(*) into n from v_offers_brand; if n <> 1 then raise exception 'FAIL 3a: brand A offers = % (expected 1)', n; end if;
  select count(*) into n from v_products_brand; if n <> 1 then raise exception 'FAIL 3b: brand A products = % (expected 1)', n; end if;
  select count(*) into n from v_product_variants_brand; if n <> 6 then raise exception 'FAIL 3c: brand A variants = % (expected 6)', n; end if;
  select count(*) into n from requests; if n <> 1 then raise exception 'FAIL 3d: brand A requests = %', n; end if;

  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER'); -- 브랜드B
  select count(*) into n from v_offers_brand; if n <> 0 then raise exception 'FAIL 3e: brand B sees offers of A'; end if;
  select count(*) into n from v_products_brand; if n <> 0 then raise exception 'FAIL 3f: brand B sees products of A'; end if;
  select count(*) into n from requests; if n <> 0 then raise exception 'FAIL 3g: brand B sees requests of A'; end if;
  select count(*) into n from orders; if n <> 0 then raise exception 'FAIL 3h'; end if;
  reset role;
  raise notice 'PASS 3: brand isolation (A sees own 1 offer/1 product/6 variants, B sees 0)';
end $$;

-- ---------- 4. 브랜드 뷰의 가격은 공급가 계산 가능한 값만 (상품가 tier + fee_rate) ----------
do $$
declare t jsonb; fee numeric;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select price_tiers, fee_rate into t, fee from v_offers_brand limit 1;
  if (t->0->>'product_price_krw')::int <> 17570 then raise exception 'FAIL 4a: product price tier %', t; end if;
  if fee <> 0.20 then raise exception 'FAIL 4b'; end if;
  reset role;
  raise notice 'PASS 4: brand sees product_price_krw 17,570 and fee_rate 0.20 (supply 21,090)';
end $$;

-- ---------- 5. 구매 권한: member는 불가, owner는 가능 (판단 함수). 직접 insert는 둘 다 거부(0008) ----------
do $$
declare ok boolean := false;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000012', 'BRAND_MEMBER');
  if auth_can_purchase('10000000-0000-0000-0000-000000000001') then raise exception 'FAIL 5a: member can purchase'; end if;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  if not auth_can_purchase('10000000-0000-0000-0000-000000000001') then raise exception 'FAIL 5b: owner cannot purchase'; end if;
  begin
    insert into sample_requests (brand_id, requested_by) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 5c: owner could insert sample_request directly (must go through server action)'; end if;
  reset role;
  raise notice 'PASS 5: purchase right member=false owner=true; direct sample_request insert denied for both';
end $$;

-- ---------- 6. CN: 배정 항목만, VENDOR는 브랜드명 마스킹 ----------
do $$
declare n int; lbl text;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  select count(*) into n from v_request_items_cn; if n <> 2 then raise exception 'FAIL 6a: sourcer sees % items', n; end if;
  select brand_label into lbl from v_request_items_cn limit 1; if lbl <> '오슬앤뮤즈' then raise exception 'FAIL 6b'; end if;
  select count(*) into n from products; if n <> 3 then raise exception 'FAIL 6c: sourcer sees % products', n; end if;

  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_VENDOR'); -- 같은 사람을 VENDOR로 가정
  select brand_label into lbl from v_request_items_cn limit 1; if lbl not like 'Brand #%' then raise exception 'FAIL 6d: vendor sees brand name %', lbl; end if;
  if (select target_price_krw from v_request_items_cn limit 1) is not null then raise exception 'FAIL 6e: vendor sees target price'; end if;
  reset role;
  raise notice 'PASS 6: CN sees only assigned items; VENDOR masked brand label and target price';
end $$;

-- ---------- 7. 트리거: 제안 발행 → 상품 코드 발급(상태는 앱이 전이, 시드가 offering), 항목 offered ----------
do $$
declare c text; s text; ris text;
begin
  select code, status::text into c, s from products where id = '40000000-0000-0000-0000-000000000001';
  if c is null or c !~ '^OS-\d\d(SS|FW)-\d{4}$' then raise exception 'FAIL 7a: code %', c; end if;
  if s <> 'offering' then raise exception 'FAIL 7b: status %', s; end if;
  select status::text into ris from request_items where id = '30000000-0000-0000-0000-000000000011';
  if ris <> 'offered' then raise exception 'FAIL 7c: item status %', ris; end if;
  raise notice 'PASS 7: offer issue trigger → code % / product offering (seed) / item offered', c;
end $$;

-- ---------- 8. 재확인 캐스케이드 ----------
do $$
declare n int;
begin
  update products set status = 'recheck' where id = '40000000-0000-0000-0000-000000000001';
  select count(*) into n from offers where product_id = '40000000-0000-0000-0000-000000000001' and status = 'recheck';
  if n <> 1 then raise exception 'FAIL 8'; end if;
  update products set status = 'offering' where id = '40000000-0000-0000-0000-000000000001';
  update offers set status = 'new' where product_id = '40000000-0000-0000-0000-000000000001';
  raise notice 'PASS 8: product recheck cascades to offers';
end $$;

-- ---------- 9. 상태 객체 직접 쓰기 거부 (0008) ----------
do $$
declare ok boolean;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  ok := false;
  begin update request_items set status = 'closed' where id = '30000000-0000-0000-0000-000000000012';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 9a: brand could update request_items.status'; end if;
  ok := false;
  begin insert into requests (brand_id, title) values ('10000000-0000-0000-0000-000000000001', 'x');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 9b: brand could insert requests directly'; end if;
  ok := false;
  begin update offers set status = 'interested' where brand_id = '10000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 9c: brand could update offers'; end if;

  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  ok := false;
  begin update request_items set status = 'offered' where id = '30000000-0000-0000-0000-000000000012';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 9d: CN could update request_items.status'; end if;
  ok := false;
  begin update products set status = 'reviewed' where id = '40000000-0000-0000-0000-000000000003';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 9e: CN could approve own product'; end if;
  reset role;
  raise notice 'PASS 9: brand/CN cannot write status-bearing tables directly';
end $$;

-- ---------- 10. 요청 영역: 브랜드는 중국어 원문을 못 읽고 뷰만, 브랜드 간 격리 ----------
do $$
declare ok boolean := false; n int; bad int;
begin
  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name in ('v_requests_brand','v_request_items_brand')
    and (column_name like '%\_zh' or column_name in ('assigned_to','ai_tags'));
  if bad > 0 then raise exception 'FAIL 11a: forbidden columns in request brand views (%)', bad; end if;

  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  begin perform description_zh from request_items limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 11b: brand could read request_items.description_zh'; end if;
  ok := false;
  begin perform memo_zh from requests limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 11c: brand could read requests.memo_zh'; end if;
  select count(*) into n from v_request_items_brand; if n <> 2 then raise exception 'FAIL 11d: brand A items = %', n; end if;
  select count(*) into n from v_requests_brand; if n <> 1 then raise exception 'FAIL 11e: brand A requests = %', n; end if;

  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER');
  select count(*) into n from v_request_items_brand; if n <> 0 then raise exception 'FAIL 11f: brand B sees A items'; end if;
  select count(*) into n from v_requests_brand; if n <> 0 then raise exception 'FAIL 11g: brand B sees A requests'; end if;

  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  select count(*) into n from v_request_items_cn where request_memo_zh is null or request_memo_zh is not null;
  if n <> 2 then raise exception 'FAIL 11h: CN view rows %', n; end if;
  reset role;
  raise notice 'PASS 10: request brand views hide *_zh/assigned_to; brand isolation on requests; CN view joined';
end $$;

-- ---------- 10. 리뷰 반영: offers/orders 직접 조회 시 내부 컬럼 거부, 옵션 jsonb에 원가 키 없음, hidden 상품 하위 데이터 미노출 ----------
do $$
declare ok boolean := false; n int; txt text;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  begin perform fx_rate from offers limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 11a: brand read offers.fx_rate'; end if;
  ok := false;
  begin perform hidden_margin_rate from offers limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 11b: brand read offers.hidden_margin_rate'; end if;
  ok := false;
  begin perform admin_memo from orders limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 11c: brand read orders.admin_memo'; end if;
  -- 허용 컬럼은 읽힌다
  perform price_tiers, fee_rate from offers limit 1;
  -- 옵션은 0017부터 v_offers_brand.option_prices(KRW)로만 노출된다
  select string_agg(option_prices::text, '') into txt from v_offers_brand;
  if txt like '%cost%' then raise exception 'FAIL 11d: cost keys leaked in option jsonb: %', txt; end if;
  reset role; perform set_config('request.jwt.claims', '', true);

  -- 상품을 hidden 으로 → 브랜드 뷰에서 이미지·variant 0행
  update products set status = 'hidden' where id = '40000000-0000-0000-0000-000000000001';
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select count(*) into n from v_product_images_brand; if n <> 0 then raise exception 'FAIL 11e: hidden product images visible (%)', n; end if;
  select count(*) into n from v_product_variants_brand; if n <> 0 then raise exception 'FAIL 11f'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  update products set status = 'offering' where id = '40000000-0000-0000-0000-000000000001';

  -- recheck 제안은 브랜드에게 가려진다
  update offers set status = 'recheck' where id = '70000000-0000-0000-0000-000000000001';
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select count(*) into n from v_offers_brand; if n <> 0 then raise exception 'FAIL 11g: recheck offer visible'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  update offers set status = 'new' where id = '70000000-0000-0000-0000-000000000001';

  -- 재제안: 만료 후 같은 키로 다시 발행 가능
  update offers set status = 'expired' where id = '70000000-0000-0000-0000-000000000001';
  insert into offers (product_id, brand_id, request_item_id, type, status, price_tiers, fee_rate, hidden_margin_rate, fx_rate, valid_until, exclusive_until)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 'reoffer', 'new',
          '[{"min_qty":30,"product_price_krw":17570}]', 0.2, 0.2, 200, current_date + 30, current_date + 14);
  ok := false;
  begin
    insert into offers (product_id, brand_id, request_item_id, type, status, price_tiers, fee_rate, hidden_margin_rate, fx_rate, valid_until)
    values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 'reoffer', 'new', '[]', 0.2, 0.2, 200, current_date + 30);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL 11h: duplicate active offer allowed'; end if;
  raise notice 'PASS 11: offers/orders column grants, option jsonb cost-free, hidden product hidden, recheck hidden, reoffer after expiry';
end $$;

-- ---------- 11. CN은 request_items 테이블을 직접 읽을 수 없고(0행) 뷰로만, 요청 이미지는 배정 항목만 ----------
do $$
declare n int;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_VENDOR');
  select count(*) into n from request_items; if n <> 0 then raise exception 'FAIL 12a: CN reads request_items table directly (%)', n; end if;
  select count(*) into n from v_request_items_cn; if n <> 2 then raise exception 'FAIL 12b: CN view rows %', n; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS 12: CN sees request items only through masked view';
end $$;

-- ---------- 13. 상품 하위 테이블·원청은 서버 액션만 쓴다(0012). CN 읽기는 그대로, 상품-요청 연결 컬럼 존재 ----------
do $$
declare ok boolean; n int;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  ok := false;
  begin insert into product_images (product_id, storage_path) values ('40000000-0000-0000-0000-000000000003', 'x/y.webp');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13a: CN could insert product_images directly'; end if;
  ok := false;
  begin insert into product_colors (product_id, name_zh) values ('40000000-0000-0000-0000-000000000003', '黑色');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13b: CN could insert product_colors directly'; end if;
  ok := false;
  begin insert into vendors (name) values ('x');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13c: CN could insert vendors directly'; end if;
  ok := false;
  begin insert into product_sizes (product_id, label) values ('40000000-0000-0000-0000-000000000003', 'M');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13f: CN could insert product_sizes directly'; end if;
  ok := false;
  begin insert into product_variants (product_id, color_id, size_id) values ('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege or unique_violation then ok := true; end;
  if not ok then raise exception 'FAIL 13g: CN could insert product_variants directly'; end if;
  ok := false;
  begin update product_images set usable_for_sales = true where product_id = '40000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13h: CN could update product_images directly'; end if;
  ok := false;
  begin update product_colors set name_zh = 'x' where product_id = '40000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13i: CN could update product_colors directly'; end if;
  ok := false;
  begin update vendors set default_hold = '{}' where id = '20000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 13j: CN could update vendors directly'; end if;
  select count(*) into n from products where created_by = '00000000-0000-0000-0000-000000000002';
  if n <> 3 then raise exception 'FAIL 13d: CN own products visible = %', n; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  perform 1 from information_schema.columns where table_name = 'products' and column_name = 'source_request_item_id';
  if not found then raise exception 'FAIL 13e: products.source_request_item_id missing'; end if;
  raise notice 'PASS 13: product sub-tables/vendors write-locked for CN; CN reads own products; source_request_item_id present';
end $$;

-- ---------- 14. 관리자 대행: ADMIN은 브랜드 요청 뷰로 해당 브랜드 행을 본다(0013), 브랜드 B는 여전히 0행 ----------
do $$
declare n int;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000001', 'ADMIN');
  select count(*) into n from v_request_items_brand where brand_id = '10000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'FAIL 14a: admin proxy sees % items (expected 2)', n; end if;
  select count(*) into n from v_requests_brand where brand_id = '10000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL 14b: admin proxy sees % requests', n; end if;
  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER');
  select count(*) into n from v_request_items_brand; if n <> 0 then raise exception 'FAIL 14c: brand B sees A items after 0013'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS 14: admin proxy reads brand request views; brand isolation intact';
end $$;

-- ---------- 15. 제안 뷰: 고정 금액 컬럼·대행 노출, 재확인 직전 상태 기록(0014·0015) ----------
do $$
declare n int; bad int; prev text; oid uuid;
begin
  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name = 'v_offers_brand' and column_name in ('status_before_recheck','fx_rate','hidden_margin_rate','decline_note_zh');
  if bad > 0 then raise exception 'FAIL 15a: internal offer columns in v_offers_brand'; end if;
  perform 1 from information_schema.columns where table_name = 'v_offers_brand' and column_name = 'option_prices';
  if not found then raise exception 'FAIL 15b: option_prices missing in v_offers_brand'; end if;

  -- 현재 살아 있는 제안 1건으로 재확인 캐스케이드 확인 (11번 검사가 재제안 행을 만들었을 수 있다)
  select id into oid from offers where product_id = '40000000-0000-0000-0000-000000000001' and status = 'new' order by issued_at desc limit 1;
  update offers set status = 'interested' where id = oid;
  update products set status = 'recheck' where id = '40000000-0000-0000-0000-000000000001';
  select status_before_recheck::text into prev from offers where id = oid;
  if prev is distinct from 'interested' then raise exception 'FAIL 15c: status_before_recheck = %', prev; end if;
  update products set status = 'offering' where id = '40000000-0000-0000-0000-000000000001';
  update offers set status = 'new', status_before_recheck = null where id = oid;

  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000001', 'ADMIN');
  select count(*) into n from v_offers_brand where brand_id = '10000000-0000-0000-0000-000000000001';
  if n < 1 then raise exception 'FAIL 15d: admin proxy sees no offers'; end if;
  select count(*) into n from v_products_brand; if n < 1 then raise exception 'FAIL 15e: admin proxy sees no products'; end if;
  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER');
  select count(*) into n from v_offers_brand; if n <> 0 then raise exception 'FAIL 15f: brand B sees offers after 0015'; end if;
  select count(*) into n from v_product_images_brand; if n <> 0 then raise exception 'FAIL 15g: brand B sees product images'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS 15: offer views expose fixed KRW columns only; admin proxy; recheck records prior status';
end $$;

-- ---------- 16. 0016·0017: 옵션 컬럼 제거, CN 코멘트 범위, recheck 직접 조회 차단, 수량 코드, 독점 원자 발행 ----------
do $$
declare n int; ok boolean; oid uuid;
begin
  perform 1 from information_schema.columns where table_name = 'v_products_brand' and column_name in ('label_options','mod_options');
  if found then raise exception 'FAIL 16a: v_products_brand still exposes option columns'; end if;
  ok := false;
  begin update request_items set expected_qty_range = '50~100' where id = '30000000-0000-0000-0000-000000000011';
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL 16b: free-text expected_qty_range accepted'; end if;

  -- CN 코멘트: 다른 CN(가상의 사용자)은 0행
  insert into comments (target_type, target_id, visibility, body_zh) values ('offer', '70000000-0000-0000-0000-000000000001', 'cn', '价格太高');
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  select count(*) into n from comments where visibility = 'cn'; if n < 1 then raise exception 'FAIL 16c: product owner CN cannot see own offer comment'; end if;
  perform test_login('00000000-0000-0000-0000-000000000099', 'CN_VENDOR');
  select count(*) into n from comments where visibility = 'cn'; if n <> 0 then raise exception 'FAIL 16d: unrelated CN sees cn comments (%)', n; end if;
  -- 브랜드: recheck 제안은 offers 테이블 직접 조회에서도 0
  reset role; perform set_config('request.jwt.claims', '', true);
  select id into oid from offers where product_id = '40000000-0000-0000-0000-000000000001' and status = 'new' limit 1;
  update offers set status = 'recheck' where id = oid;
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select count(*) into n from offers where id = oid; if n <> 0 then raise exception 'FAIL 16e: brand reads recheck offer from table'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  update offers set status = 'new' where id = oid;

  -- 독점 원자 발행: 브랜드 A 독점 중인 상품을 브랜드 B에 발행하면 거부
  ok := false;
  begin
    perform issue_offer_locked(jsonb_build_object('product_id', '40000000-0000-0000-0000-000000000001', 'brand_id', '10000000-0000-0000-0000-000000000002',
      'type', 'reoffer', 'price_tiers', '[{"min_qty":30,"product_price_krw":17570}]'::jsonb, 'fee_rate', 0.2, 'hidden_margin_rate', 0.2, 'fx_rate', 200,
      'valid_until', (current_date + 30)::text, 'exclusive_until', (current_date + 14)::text, 'owner_role', 'BRAND'));
  exception when raise_exception then ok := sqlerrm = 'offer_exclusive'; end;
  if not ok then raise exception 'FAIL 16f: exclusive conflict not blocked by issue_offer_locked'; end if;
  raise notice 'PASS 16: option columns gone; qty codes enforced; CN comments scoped; recheck hidden on table; exclusive issue atomic';
end $$;

-- ---------- 17. (0020) CN은 offers 테이블 직접 조회 0행, 코멘트는 definer 함수로 계속 보임, issue_offer_locked는 authenticated 실행 불가 ----------
do $$
declare n int; ok boolean := false;
begin
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_VENDOR');
  select count(*) into n from offers; if n <> 0 then raise exception 'FAIL 17a: CN reads offers directly (%)', n; end if;
  begin
    perform issue_offer_locked('{}'::jsonb);
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  if not ok then raise exception 'FAIL 17b: authenticated can execute issue_offer_locked'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  insert into comments (target_type, target_id, author_id, visibility, body_zh) values ('offer', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'cn', '价格偏高');
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  select count(*) into n from comments where target_type = 'offer' and target_id = '70000000-0000-0000-0000-000000000001';
  if n < 1 then raise exception 'FAIL 17c: CN cannot see own-product offer comment via cn_owns_offer (%)', n; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  delete from comments where target_type = 'offer' and target_id = '70000000-0000-0000-0000-000000000001' and body_zh = '价格偏高';
  raise notice 'PASS 17: CN cannot read offers table; comments via cn_owns_offer; issue_offer_locked service-only';
end $$;

-- ---------- 18. 샘플 (0021·0022): 브랜드 뷰 금지 컬럼, 브랜드 격리, CN 마스킹·직접 조회 차단, 결제 자동화 필드 없음 ----------
do $$
declare n int; bad int; lbl text; ok boolean; sr uuid; vid uuid; oid uuid;
begin
  select id into oid from offers where product_id = '40000000-0000-0000-0000-000000000001' and brand_id = '10000000-0000-0000-0000-000000000001' order by issued_at limit 1;
  select id into vid from product_variants where product_id = '40000000-0000-0000-0000-000000000001' limit 1;
  insert into sample_requests (brand_id, status, logistics_fee_krw) values ('10000000-0000-0000-0000-000000000001', 'requested', 11200) returning id into sr;
  insert into sample_items (sample_request_id, brand_id, offer_id, variant_id, qty, inspection_note_internal, feedback_note, feedback_note_zh)
  values (sr, '10000000-0000-0000-0000-000000000001', oid, vid, 2, '내부: 봉제 약함', '색이 예뻐요', '颜色好看');

  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name in ('v_sample_requests_brand','v_sample_items_brand')
    and (column_name in ('inspection_note_internal','feedback_note_zh','cn_tracking','library_location') or column_name like '%cost%' or column_name like '%\_zh');
  if bad > 0 then raise exception 'FAIL 18a: forbidden columns in sample brand views (%)', bad; end if;
  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name in ('sample_requests','sample_items','orders')
    and (column_name ~ '(^pg_|card|pay_key|payment_key|tid$|imp_uid|merchant_uid|tax_invoice)');
  if bad > 0 then raise exception 'FAIL 18b: payment automation fields exist (rule 13)'; end if;

  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select count(*) into n from v_sample_items_brand; if n <> 1 then raise exception 'FAIL 18c: brand A sample items %', n; end if;
  ok := false;
  begin perform inspection_note_internal from sample_items limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 18d: brand read inspection_note_internal'; end if;
  ok := false;
  begin perform cn_tracking from sample_requests limit 1; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL 18l: brand read sample_requests.cn_tracking from table'; end if;
  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER');
  select count(*) into n from v_sample_items_brand; if n <> 0 then raise exception 'FAIL 18e: brand B sees A samples'; end if;
  select count(*) into n from v_sample_requests_brand; if n <> 0 then raise exception 'FAIL 18f: brand B sees A sample requests'; end if;

  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_SOURCER');
  select brand_label into lbl from v_sample_items_cn where sample_request_id = sr; if lbl <> '오슬앤뮤즈' then raise exception 'FAIL 18g: sourcer label %', lbl; end if;
  select count(*) into n from sample_items; if n <> 0 then raise exception 'FAIL 18h: CN reads sample_items table directly (%)', n; end if;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_VENDOR');
  select brand_label into lbl from v_sample_items_cn where sample_request_id = sr; if lbl not like 'Brand #%' then raise exception 'FAIL 18i: vendor sees brand name %', lbl; end if;
  perform 1 from information_schema.columns where table_name = 'v_sample_items_cn' and column_name in ('feedback_note','ship_to');
  if found then raise exception 'FAIL 18j: CN view exposes brand text/address'; end if;
  perform test_login('00000000-0000-0000-0000-000000000099', 'CN_SOURCER');
  select count(*) into n from v_sample_items_cn; if n <> 0 then raise exception 'FAIL 18k: unrelated CN sees samples'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  delete from sample_requests where id = sr;
  raise notice 'PASS 18: sample views hide internal/zh; brand isolation; CN masked view only; no payment automation fields';
end $$;

-- ---------- 19. 발주 (0023·0024): 브랜드 뷰에 관리자 메모 없음, 격리, CN 마스킹·KRW 없음·직접 조회 차단 ----------
do $$
declare n int; bad int; lbl text; ord uuid; vid uuid; oid uuid;
begin
  select id into oid from offers where product_id = '40000000-0000-0000-0000-000000000001' and brand_id = '10000000-0000-0000-0000-000000000001' order by issued_at limit 1;
  select id into vid from product_variants where product_id = '40000000-0000-0000-0000-000000000001' limit 1;
  insert into orders (brand_id, status, admin_memo) values ('10000000-0000-0000-0000-000000000001', 'stock_checking', '내부 메모') returning id into ord;
  insert into order_lines (order_id, brand_id, offer_id, variant_id, expected_qty, unit_price_krw) values (ord, '10000000-0000-0000-0000-000000000001', oid, vid, 50, 21090);

  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name in ('v_orders_brand','v_order_lines_brand') and column_name in ('admin_memo','admin_waived','confirmed_by','cn_note');
  if bad > 0 then raise exception 'FAIL 19a: internal columns in order brand views (%)', bad; end if;
  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name = 'v_order_lines_cn' and column_name in ('unit_price_krw','brand_id','invoice_snapshot','defect_qty');
  if bad > 0 then raise exception 'FAIL 19b: CN order view exposes KRW/brand data (%)', bad; end if;

  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select count(*) into n from v_order_lines_brand where order_id = ord; if n <> 1 then raise exception 'FAIL 19c: brand A order lines %', n; end if;
  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER');
  select count(*) into n from v_orders_brand; if n <> 0 then raise exception 'FAIL 19d: brand B sees A orders'; end if;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_VENDOR');
  select brand_label into lbl from v_order_lines_cn where order_id = ord; if lbl not like 'Brand #%' then raise exception 'FAIL 19e: vendor sees brand %', lbl; end if;
  select count(*) into n from order_lines; if n <> 0 then raise exception 'FAIL 19f: CN reads order_lines table (%)', n; end if;
  perform test_login('00000000-0000-0000-0000-000000000099', 'CN_SOURCER');
  select count(*) into n from v_order_lines_cn; if n <> 0 then raise exception 'FAIL 19g: unrelated CN sees order lines'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  delete from orders where id = ord;
  raise notice 'PASS 19: order views hide admin memo; brand isolation; CN masked view without KRW; no direct CN table read';
end $$;

-- ---------- 20. r4 (0031): 샘플 피드백 트리거 감사 로그(actor = feedback_by), 독점 판정 KST ----------
do $$
declare n int; sr uuid; si uuid; vid uuid; oid uuid; st offer_status; rx reaction; src text;
begin
  select id, status, reaction into oid, st, rx from offers where product_id = '40000000-0000-0000-0000-000000000001' and brand_id = '10000000-0000-0000-0000-000000000001' order by issued_at limit 1;
  select id into vid from product_variants where product_id = '40000000-0000-0000-0000-000000000001' limit 1;
  insert into sample_requests (brand_id, status, logistics_fee_krw) values ('10000000-0000-0000-0000-000000000001', 'delivered', 11200) returning id into sr;
  insert into sample_items (sample_request_id, brand_id, offer_id, variant_id, qty) values (sr, '10000000-0000-0000-0000-000000000001', oid, vid, 1) returning id into si;
  update sample_items set feedback = 'interested', feedback_by = '00000000-0000-0000-0000-000000000011' where id = si;
  select count(*) into n from audit_logs where action = 'offer.reaction_from_sample' and entity_id = oid
    and actor_id = '00000000-0000-0000-0000-000000000011' and diff->>'sample_item_id' = si::text;
  if n <> 1 then raise exception 'FAIL 20a: feedback trigger audit log missing (%)', n; end if;
  select prosrc into src from pg_proc where proname = 'issue_offer_locked';
  if src not like '%Asia/Seoul%' or src like '%>= current_date%' then raise exception 'FAIL 20b: issue_offer_locked not KST'; end if;
  delete from audit_logs where action = 'offer.reaction_from_sample' and entity_id = oid;
  delete from sample_requests where id = sr;
  update offers set status = st, reaction = rx where id = oid;
  raise notice 'PASS 20: sample feedback trigger audited with actor; exclusive check uses KST date';
end $$;

-- ---------- 21. 발주 브랜드 뷰 (0029·0030): 운송장 공개, 내부·CN·원가 키 없음 ----------
do $$
declare bad int; ok boolean;
begin
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_orders_brand' and column_name = 'kr_tracking') into ok;
  if not ok then raise exception 'FAIL 21a: kr_tracking missing in v_orders_brand'; end if;
  select count(*) into bad from information_schema.columns
  where table_schema = 'public' and table_name in ('v_orders_brand','v_order_lines_brand')
    and (column_name in ('admin_memo','admin_waived','confirmed_by','cn_note','cn_tracking','weight_g','fx_rate','hidden_margin_rate')
         or column_name like '%cost%' or column_name like '%\_zh');
  if bad > 0 then raise exception 'FAIL 21b: forbidden keys in brand order views (%)', bad; end if;
  select count(*) into bad from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'order_lines' and grantee = 'authenticated' and privilege_type = 'SELECT' and column_name in ('cn_tracking','cn_note');
  if bad > 0 then raise exception 'FAIL 21c: authenticated can select CN line columns (%)', bad; end if;
  -- 발주서 단위 cn_shipped_at은 타임라인(중국 출고)으로 브랜드에 보인다. 라인 단위 CN 운송장·출고 시각은 비공개.
  raise notice 'PASS 21: brand order views expose tracking only; no internal/CN/cost keys';
end $$;

-- ---------- 22. CN 뷰 ADMIN 언마스킹 (0032): ADMIN·CN_SOURCER는 브랜드명, CN_VENDOR는 마스킹 ----------
do $$
declare lbl text; sr uuid; vid uuid; oid uuid;
begin
  select id into oid from offers where product_id = '40000000-0000-0000-0000-000000000001' and brand_id = '10000000-0000-0000-0000-000000000001' order by issued_at limit 1;
  select id into vid from product_variants where product_id = '40000000-0000-0000-0000-000000000001' limit 1;
  insert into sample_requests (brand_id, status, logistics_fee_krw) values ('10000000-0000-0000-0000-000000000001', 'requested', 11200) returning id into sr;
  insert into sample_items (sample_request_id, brand_id, offer_id, variant_id, qty) values (sr, '10000000-0000-0000-0000-000000000001', oid, vid, 1);
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000001', 'ADMIN');
  select brand_label into lbl from v_sample_items_cn where sample_request_id = sr;
  if lbl like 'Brand #%' or lbl is null then raise exception 'FAIL 22a: admin sees masked brand %', lbl; end if;
  perform test_login('00000000-0000-0000-0000-000000000002', 'CN_VENDOR');
  select brand_label into lbl from v_sample_items_cn where sample_request_id = sr;
  if lbl not like 'Brand #%' then raise exception 'FAIL 22b: vendor sees brand %', lbl; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  delete from sample_requests where id = sr;
  raise notice 'PASS 22: CN views unmasked for ADMIN, masked for CN_VENDOR';
end $$;

-- ---------- 23. 알림 (0033·0034): 본인 알림만, read_at 외 수정·생성 불가, 발송 기록 비공개 ----------
do $$
declare n int; nid uuid; ok boolean;
begin
  insert into notifications (recipient_id, kind, type, title, link_path) values ('00000000-0000-0000-0000-000000000011', 'instant', 'offer.issued', '새 제안', '/b/a/offers') returning id into nid;
  set local role authenticated;
  perform test_login('00000000-0000-0000-0000-000000000021', 'BRAND_OWNER');
  select count(*) into n from notifications where id = nid; if n <> 0 then raise exception 'FAIL 23a: other user sees notification'; end if;
  perform test_login('00000000-0000-0000-0000-000000000011', 'BRAND_OWNER');
  select count(*) into n from notifications where id = nid; if n <> 1 then raise exception 'FAIL 23b: owner cannot see own notification'; end if;
  update notifications set read_at = now() where id = nid;
  ok := true;
  begin
    update notifications set link_path = 'https://evil.example' where id = nid;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then raise exception 'FAIL 23c: user can rewrite link_path'; end if;
  ok := true;
  begin
    perform email_sent_at from notifications where id = nid;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then raise exception 'FAIL 23d: delivery columns readable'; end if;
  ok := true;
  begin
    insert into notifications (recipient_id, kind, type, title) values ('00000000-0000-0000-0000-000000000011', 'instant', 'x', 'spoof');
  exception when insufficient_privilege then ok := false;
  end;
  if ok then raise exception 'FAIL 23e: user can insert notifications'; end if;
  reset role; perform set_config('request.jwt.claims', '', true);
  select read_at is not null into ok from notifications where id = nid; if not ok then raise exception 'FAIL 23f: read_at not updated'; end if;
  delete from notifications where id = nid;
  raise notice 'PASS 23: notifications self-only; read_at only writable; no insert; delivery columns hidden';
end $$;

-- ---------- 24. 크레딧 원자 함수 (0035): 사용은 잔액 한도, 적립은 +, 서비스 롤 전용 ----------
do $$
declare before int; used int; after int; ok boolean;
begin
  select credit_balance_krw into before from brands where id = '10000000-0000-0000-0000-000000000001';
  perform credit_brand('10000000-0000-0000-0000-000000000001', 5000);
  used := use_brand_credit('10000000-0000-0000-0000-000000000001', 1000000);
  if used <> before + 5000 then raise exception 'FAIL 24a: use capped at balance (% vs %)', used, before + 5000; end if;
  select credit_balance_krw into after from brands where id = '10000000-0000-0000-0000-000000000001';
  if after <> 0 then raise exception 'FAIL 24b: balance after use %', after; end if;
  used := use_brand_credit('10000000-0000-0000-0000-000000000001', 1000);
  if used <> 0 then raise exception 'FAIL 24c: used from empty balance %', used; end if;
  perform credit_brand('10000000-0000-0000-0000-000000000001', before);
  select has_function_privilege('authenticated', 'use_brand_credit(uuid, integer)', 'execute') or has_function_privilege('authenticated', 'credit_brand(uuid, integer)', 'execute') into ok;
  if ok then raise exception 'FAIL 24d: authenticated can execute credit functions'; end if;
  raise notice 'PASS 24: credit use capped by balance; credit adds; service-only';
end $$;

drop function test_login(uuid, text);
