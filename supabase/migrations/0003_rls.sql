-- 0003 RLS. PRD 6장.
-- 원칙: 브랜드는 brand_id in auth_brand_ids() 행만. 브랜드는 products/product_costs/vendors를 뷰로만 읽는다(0005에서 revoke).
-- 서비스 롤은 RLS를 우회한다(Supabase 기본).

create or replace function auth_brand_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select brand_id from brand_members where profile_id = auth.uid()
$$;

create or replace function auth_can_purchase(p_brand uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from brand_members m
    where m.profile_id = auth.uid() and m.brand_id = p_brand and (m.level = 'owner' or m.can_purchase)
  )
$$;

-- CN이 볼 수 있는 상품: 본인 등록 또는 배정된 요청 항목에 걸린 제안의 상품
create or replace function cn_can_see_product(p_product uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from products p where p.id = p_product and p.created_by = auth.uid())
      or exists (select 1 from offers o join request_items ri on ri.id = o.request_item_id
                 where o.product_id = p_product and ri.assigned_to = auth.uid())
$$;

alter table profiles enable row level security;
alter table brands enable row level security;
alter table brand_members enable row level security;
alter table brand_applications enable row level security;
alter table vendors enable row level security;
alter table requests enable row level security;
alter table request_items enable row level security;
alter table request_images enable row level security;
alter table products enable row level security;
alter table product_costs enable row level security;
alter table product_images enable row level security;
alter table product_colors enable row level security;
alter table product_sizes enable row level security;
alter table product_variants enable row level security;
alter table offers enable row level security;
alter table sample_requests enable row level security;
alter table sample_items enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table inspection_templates enable row level security;
alter table inspections enable row level security;
alter table comments enable row level security;
alter table cn_questions enable row level security;
alter table export_packages enable row level security;
alter table notifications enable row level security;
alter table settings enable row level security;
alter table settings_history enable row level security;
alter table glossary enable row level security;
alter table audit_logs enable row level security;

-- ADMIN 전체
do $$ declare t text; begin
  foreach t in array array['profiles','brands','brand_members','brand_applications','vendors','requests','request_items','request_images',
    'products','product_costs','product_images','product_colors','product_sizes','product_variants','offers','sample_requests','sample_items',
    'orders','order_lines','inspection_templates','inspections','comments','cn_questions','export_packages','notifications','settings','settings_history','glossary','audit_logs']
  loop execute format('create policy %I_admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t); end loop;
end $$;

-- profiles: 본인
create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- brands / members: 소속 브랜드만
create policy brands_member_select on brands for select to authenticated using (is_brand() and id in (select auth_brand_ids()));
create policy brand_members_select on brand_members for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy brand_members_owner_insert on brand_members for insert to authenticated
  with check (is_brand() and exists (select 1 from brand_members m where m.brand_id = brand_members.brand_id and m.profile_id = auth.uid() and m.level = 'owner'));

-- brand_applications: 공개 폼은 anon insert (서버 액션에서 수행), 조회는 ADMIN만
create policy brand_applications_insert on brand_applications for insert to anon, authenticated with check (true);

-- requests / items / images: 브랜드 소속
create policy requests_brand on requests for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy requests_brand_insert on requests for insert to authenticated with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy requests_brand_update on requests for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));

create policy request_items_brand on request_items for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy request_items_brand_insert on request_items for insert to authenticated with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy request_items_brand_update on request_items for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
-- CN: 배정된 항목만 (브랜드 식별 마스킹은 뷰 v_request_items_cn)
create policy request_items_cn on request_items for select to authenticated using (is_cn() and assigned_to = auth.uid());
create policy request_items_cn_update on request_items for update to authenticated using (is_cn() and assigned_to = auth.uid()) with check (is_cn() and assigned_to = auth.uid());

create policy request_images_brand on request_images for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy request_images_brand_insert on request_images for insert to authenticated with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy request_images_cn on request_images for select to authenticated
  using (is_cn() and exists (select 1 from request_items ri where ri.id = request_images.request_item_id and ri.assigned_to = auth.uid()));

-- vendors: CN 조회·등록 (브랜드는 권한 자체 없음)
create policy vendors_cn_select on vendors for select to authenticated using (is_cn());
create policy vendors_cn_insert on vendors for insert to authenticated with check (is_cn());

-- products: CN 본인/배정. 브랜드는 테이블 권한 없음(뷰만).
create policy products_cn_select on products for select to authenticated using (is_cn() and cn_can_see_product(id));
create policy products_cn_insert on products for insert to authenticated with check (is_cn() and created_by = auth.uid());
create policy products_cn_update on products for update to authenticated using (is_cn() and created_by = auth.uid()) with check (is_cn() and created_by = auth.uid());

create policy product_costs_cn on product_costs for all to authenticated
  using (is_cn() and exists (select 1 from products p where p.id = product_costs.product_id and p.created_by = auth.uid()))
  with check (is_cn() and exists (select 1 from products p where p.id = product_costs.product_id and p.created_by = auth.uid()));

do $$ declare t text; begin
  foreach t in array array['product_images','product_colors','product_sizes','product_variants'] loop
    execute format('create policy %I_cn on %I for all to authenticated using (is_cn() and cn_can_see_product(product_id)) with check (is_cn() and exists (select 1 from products p where p.id = %I.product_id and p.created_by = auth.uid()))', t, t, t);
  end loop;
end $$;

-- offers: 브랜드 소속 (가격 내부 컬럼은 뷰에서 제외). CN은 본인 상품의 제안 반응만 조회(브랜드 마스킹은 뷰).
create policy offers_brand on offers for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy offers_brand_update on offers for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy offers_cn on offers for select to authenticated using (is_cn() and exists (select 1 from products p where p.id = offers.product_id and p.created_by = auth.uid()));

-- sample / order: 브랜드 소속. CN은 본인 상품 라인 조회(출고·재고 응답은 서버 액션).
create policy sample_requests_brand on sample_requests for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy sample_requests_brand_insert on sample_requests for insert to authenticated with check (is_brand() and auth_can_purchase(brand_id));
create policy sample_requests_brand_update on sample_requests for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy sample_items_brand on sample_items for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy sample_items_brand_insert on sample_items for insert to authenticated with check (is_brand() and auth_can_purchase(brand_id));
create policy sample_items_brand_update on sample_items for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy sample_items_cn on sample_items for select to authenticated
  using (is_cn() and exists (select 1 from offers o join products p on p.id = o.product_id where o.id = sample_items.offer_id and p.created_by = auth.uid()));

create policy orders_brand on orders for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy orders_brand_insert on orders for insert to authenticated with check (is_brand() and auth_can_purchase(brand_id));
create policy orders_brand_update on orders for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy order_lines_brand on order_lines for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy order_lines_brand_insert on order_lines for insert to authenticated with check (is_brand() and auth_can_purchase(brand_id));
create policy order_lines_brand_update on order_lines for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));
create policy order_lines_cn on order_lines for select to authenticated
  using (is_cn() and exists (select 1 from offers o join products p on p.id = o.product_id where o.id = order_lines.offer_id and p.created_by = auth.uid()));
create policy order_lines_cn_update on order_lines for update to authenticated
  using (is_cn() and exists (select 1 from offers o join products p on p.id = o.product_id where o.id = order_lines.offer_id and p.created_by = auth.uid()))
  with check (is_cn());

-- inspections: 브랜드는 자기 것 조회
create policy inspections_brand on inspections for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()));
create policy inspection_templates_read on inspection_templates for select to authenticated using (true);

-- comments: 가시성별
create policy comments_brand on comments for select to authenticated using (is_brand() and visibility = 'brand' and brand_id in (select auth_brand_ids()));
create policy comments_brand_insert on comments for insert to authenticated with check (is_brand() and visibility = 'brand' and brand_id in (select auth_brand_ids()) and author_id = auth.uid());
create policy comments_cn on comments for select to authenticated using (is_cn() and visibility = 'cn');
create policy comments_cn_insert on comments for insert to authenticated with check (is_cn() and visibility = 'cn' and author_id = auth.uid());

-- cn_questions: CN 본인 작성·조회, 브랜드는 released 이후
create policy cn_questions_cn on cn_questions for select to authenticated using (is_cn() and asked_by = auth.uid());
create policy cn_questions_cn_insert on cn_questions for insert to authenticated with check (is_cn() and asked_by = auth.uid());
create policy cn_questions_brand on cn_questions for select to authenticated using (is_brand() and brand_id in (select auth_brand_ids()) and released_at is not null);
create policy cn_questions_brand_answer on cn_questions for update to authenticated using (is_brand() and brand_id in (select auth_brand_ids()) and released_at is not null) with check (is_brand() and brand_id in (select auth_brand_ids()));

-- export_packages: 브랜드 소속
create policy export_packages_brand on export_packages for all to authenticated using (is_brand() and brand_id in (select auth_brand_ids())) with check (is_brand() and brand_id in (select auth_brand_ids()));

-- notifications: 본인
create policy notifications_self on notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_self_update on notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- glossary: CN 조회 (브랜드 권한 없음)
create policy glossary_cn on glossary for select to authenticated using (is_cn());
