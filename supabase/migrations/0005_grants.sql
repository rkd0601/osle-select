-- 0005 권한. PRD 6장: 브랜드는 products/product_costs/vendors/glossary/settings 테이블 SELECT 자체가 없다.
-- Supabase는 authenticated 롤 하나를 쓰므로 "브랜드 역할" 격리는 두 겹이다:
--   (1) 테이블 RLS 정책에 브랜드용 정책을 두지 않음 → 행이 보이지 않음(0003)
--   (2) 아래 grant: 브랜드가 쓰는 뷰에만 select를 주고, 원가 테이블은 authenticated에서 아예 revoke
-- product_costs는 RLS로 ADMIN·CN만 보지만, 방어 겹을 하나 더 두기 위해 뷰 밖 접근은 ADMIN·CN도 서버(서비스 롤)에서만 하도록 권장한다.

-- 기본 권한 정리
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- authenticated: RLS가 걸린 테이블에 기본 DML 허용(행 필터는 RLS가 담당)
grant select, insert, update on
  profiles, brands, brand_members, requests, request_items, request_images,
  products, product_images, product_colors, product_sizes, product_variants,
  offers, sample_requests, sample_items, orders, order_lines, inspections, inspection_templates,
  comments, cn_questions, export_packages, notifications
to authenticated;

-- 원가·원청·설정·용어 사전: 브랜드 역할은 접근 불가. 애플리케이션은 이 테이블들을 서비스 롤(서버)에서만 다룬다.
-- CN이 직접 원가를 입력하는 경로도 서버 액션(서비스 롤 + 역할 검증)을 통한다.
revoke all on product_costs, vendors, settings, settings_history, glossary, audit_logs, brand_applications from authenticated;
grant insert on brand_applications to anon, authenticated;        -- 공개 신청 폼
grant select on inspection_templates to authenticated;

-- 뷰
grant select on v_offers_brand, v_products_brand, v_product_images_brand, v_product_colors_brand, v_product_sizes_brand, v_product_variants_brand to authenticated;
grant select on v_request_items_cn, v_admin_queue to authenticated;

-- 시퀀스/함수
grant usage on schema public to anon, authenticated;
grant execute on function auth_role(), is_admin(), is_cn(), is_brand(), auth_brand_ids(), auth_can_purchase(uuid), cn_can_see_product(uuid) to anon, authenticated;

-- 뷰 소유자(definer) 보호: security_invoker=false 뷰가 products/vendors를 읽을 수 있도록 소유자는 postgres(마이그레이션 실행 롤)이어야 한다.
-- 브랜드가 v_products_brand로 볼 수 있는 컬럼은 뷰 정의에 열거된 것뿐이며 cost·vendor_code·fx·hidden_margin·weight_g·*_zh 는 포함되지 않는다.
