-- 로컬 시드. PRD 13장 1단계: ADMIN 1, CN 1, 원청 2, 브랜드 2(+owner/member), 요청 1, 상품 3.
-- auth.users는 Supabase Auth가 관리한다. 로컬에서는 아래처럼 직접 넣는다(비밀번호는 Supabase Studio에서 재설정).
-- 로컬 전용. 실제 Supabase(GoTrue)는 토큰 컬럼이 NULL이면 로그인 시 스캔 에러가 나므로 빈 문자열로 채운다. 비밀번호: password123
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, crypt('password123', gen_salt('bf')), now(),
  jsonb_build_object('provider','email','providers',array['email'],'role',u.r), '{}', '', '', '', '', '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@wearethe.co.kr', 'ADMIN'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'cn.wang@wearethe.co.kr', 'CN_SOURCER'),
  ('00000000-0000-0000-0000-000000000011'::uuid, 'owner@osle-muz.example', 'BRAND_OWNER'),
  ('00000000-0000-0000-0000-000000000012'::uuid, 'md@osle-muz.example', 'BRAND_MEMBER'),
  ('00000000-0000-0000-0000-000000000021'::uuid, 'owner@brand-b.example', 'BRAND_OWNER')
) as u(id, email, r)
on conflict (id) do nothing;
insert into auth.identities (user_id, provider, provider_id, identity_data)
select id, 'email', id::text, jsonb_build_object('sub', id::text, 'email', email) from auth.users where id::text like '00000000-0000-0000-0000-0000000000%'
on conflict (provider, provider_id) do nothing;

insert into profiles (id, display_name, locale) values
  ('00000000-0000-0000-0000-000000000001', '위아더 관리자', 'ko'),
  ('00000000-0000-0000-0000-000000000002', '王小姐', 'zh-CN'),
  ('00000000-0000-0000-0000-000000000011', '김대표', 'ko'),
  ('00000000-0000-0000-0000-000000000012', '박MD', 'ko'),
  ('00000000-0000-0000-0000-000000000021', '브랜드B 대표', 'ko');

insert into settings (key, value) values
  ('fx_rate_cny_krw', '200'), ('hidden_margin_rate', '0.20'), ('fee_rate', '0.20'),
  ('sample_air_per_kg_krw', '15000'), ('domestic_shipping_krw', '4000'),
  ('logistics_estimate_per_kg_krw', '5000'), ('customs_estimate_rate', '0.23'),
  ('exclusive_days', '14'), ('offer_valid_days', '30'), ('fx_recheck_pct', '0.03'),
  ('sample_feedback_days', '14'), ('sample_return_days', '14'), ('sample_qty_max', '3'),
  ('report_days', '7'), ('cn_question_gate_hours', '4'), ('review_sla_days', '2'),
  ('categories', '["아우터","상의","하의","원피스","신발","가방","액세서리"]'),
  ('decline_reasons', '["price","design","fabric","leadtime","other"]'),
  ('rejection_templates', '[{"code":"photos","ko":"사진 부족","zh":"照片不足"},{"code":"fabric","ko":"혼용률 불명","zh":"成分不明"},{"code":"size_chart","ko":"사이즈표 없음","zh":"缺尺码表"},{"code":"verified","ko":"실물 확인 없음","zh":"未看实物"},{"code":"weight","ko":"중량 없음","zh":"缺重量"},{"code":"vendor","ko":"원청 정보 없음","zh":"缺档口信息"}]');

insert into brands (id, slug, name, type, tier) values
  ('10000000-0000-0000-0000-000000000001', 'osle-muz', '오슬앤뮤즈', 'influencer', 'proven'),
  ('10000000-0000-0000-0000-000000000002', 'brand-b', '브랜드B', 'brand', 'new');

insert into brand_members (brand_id, profile_id, level, can_purchase) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'owner', true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'member', false),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000021', 'owner', true);

insert into vendors (id, name, market, booth, default_hold, default_label_options, default_mod_options, trust_score, created_by) values
  ('20000000-0000-0000-0000-000000000001', '中洲 3F-312', '항저우 중저', '3F-312', '{"deposit_pct":0.3,"days":7}',
   '[{"type":"main_label","moq":100,"unit_cost_cny":2,"lead_days":5},{"type":"care_label","moq":100,"unit_cost_cny":1,"lead_days":5},{"type":"hangtag","moq":100,"unit_cost_cny":1.5,"lead_days":5}]',
   '[{"item":"add_color","moq":300,"cost_cny":0,"lead_days":7}]', 98, '00000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000002', '旺田 2F-05', '항저우 왕톈', '2F-05', '{"none":true}', '[{"type":"main_label","moq":200,"unit_cost_cny":2,"lead_days":7}]', '[]', 91, '00000000-0000-0000-0000-000000000002');

insert into requests (id, brand_id, created_by, title, memo) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '에코퍼 F/W', '이런 느낌의 에코퍼 자켓이랑 롱코트, 11월 중순 공구');
insert into request_items (id, request_id, brand_id, seq, category, description, target_price_krw, expected_qty_range, status, owner_role, due_at, assigned_to, sla_date) values
  ('30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '아우터', '에코퍼 크롭 자켓', 20000, '50~100', 'sourcing', 'CN', now() + interval '3 days', '00000000-0000-0000-0000-000000000002', current_date + 3),
  ('30000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, '아우터', '롱 코트', null, '30', 'sourcing', 'CN', now() + interval '5 days', '00000000-0000-0000-0000-000000000002', current_date + 5);

-- 상품 3: 라인시트(GRIP 에코퍼) 기준
insert into products (id, vendor_id, created_by, status, category, name_zh, name_ko, fabric, origin, care_codes, supply_type, min_qty, weight_g, verified_in_person, verified_at, verified_place, sample_ok, sample_cost_cny) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'reviewed', '아우터', '仿皮草短款翻领外套', '에코퍼 크롭 카라 자켓', '[{"material_code":"polyester","pct":100}]', 'CN', '{dry}', 'stock', 30, 480, true, now(), '中洲 3F', true, 73.2),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'reviewed', '아우터', '仿皮草长款大衣', '에코퍼 롱 코트', '[{"material_code":"polyester","pct":100}]', 'CN', '{dry}', 'stock', 30, 1100, true, now(), '中洲 3F', true, 201.6),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'pending_review', '아우터', '短款羊剪绒', '숏 무스탕', '[]', 'CN', '{}', 'stock', 50, null, true, now(), '旺田 2F', true, 102);

insert into product_costs (product_id, tiers, vendor_code, source_market) values
  ('40000000-0000-0000-0000-000000000001', '[{"min_qty":30,"cost_cny":73.2},{"min_qty":100,"cost_cny":68},{"min_qty":300,"cost_cny":64}]', 'KFC-26FW01602', '中洲'),
  ('40000000-0000-0000-0000-000000000002', '[{"min_qty":30,"cost_cny":201.6},{"min_qty":100,"cost_cny":190}]', 'MIC-26AK40151', '中洲'),
  ('40000000-0000-0000-0000-000000000003', '[{"min_qty":50,"cost_cny":102}]', 'AOO-2600244', '旺田');

insert into product_colors (id, product_id, name_zh, name_ko, sort_order) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '粉色', 'Pink', 0),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '棕色', 'Brown', 1);
insert into product_sizes (id, product_id, label, measurements, sort_order) values
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'S', '{"총장":52,"어깨":40,"가슴":52}', 0),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'M', '{"총장":54,"어깨":42,"가슴":54}', 1),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'L', '{"총장":56,"어깨":44,"가슴":56}', 2);
insert into product_variants (product_id, color_id, size_id)
select '40000000-0000-0000-0000-000000000001', c.id, s.id from product_colors c cross join product_sizes s
where c.product_id = '40000000-0000-0000-0000-000000000001' and s.product_id = '40000000-0000-0000-0000-000000000001';
insert into product_images (product_id, storage_path, kind, source, usable_for_sales, sort_order)
select '40000000-0000-0000-0000-000000000001', format('product-images/p1/%s.webp', g), case when g <= 3 then 'real'::image_kind else 'model'::image_kind end, case when g <= 3 then 'own'::image_source else 'vendor'::image_source end, g <= 3, g from generate_series(1,6) g;

-- 제안 1: 상품 1 → 오슬앤뮤즈 항목 1 (가격 고정: ¥73.2×200×1.2=17,570 / 68→16,320 / 64→15,360)
insert into offers (id, product_id, brand_id, request_item_id, type, status, price_tiers, fee_rate, hidden_margin_rate, fx_rate, sample_fee_product_krw, valid_until, exclusive_until, issued_by, owner_role, due_at) values
  ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 'request', 'new',
   '[{"min_qty":30,"product_price_krw":17570},{"min_qty":100,"product_price_krw":16320},{"min_qty":300,"product_price_krw":15360}]', 0.20, 0.20, 200, 17570, current_date + 30, current_date + 14,
   '00000000-0000-0000-0000-000000000001', 'BRAND', now() + interval '14 days');

insert into glossary (term_zh, term_ko, category, approved) values
  ('仿皮草', '에코퍼', '소재', true), ('雪纺', '쉬폰', '소재', true), ('针织', '니트', '소재', true), ('阔腿裤', '와이드 팬츠', '품목', true), ('加绒', '기모 안감', '소재', false);

insert into inspection_templates (category, checklist) values
  ('아우터', '[{"field":"fabric","label_ko":"혼용률 라벨 대조"},{"field":"measurements","label_ko":"실측 ±1.5cm","tolerance_cm":1.5},{"field":"color","label_ko":"컬러 대표 사진 대조"},{"field":"sewing","label_ko":"봉제·부자재·마감"},{"field":"weight_g","label_ko":"중량 실측"}]');
