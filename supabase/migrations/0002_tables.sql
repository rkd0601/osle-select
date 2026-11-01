-- 0002 테이블. PRD 5장. 브랜드 측 테이블은 brand_id 필수.
-- profiles: role 컬럼 없음 (JWT app_metadata.role)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'ko' check (locale in ('ko','zh-CN')),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  type brand_type not null default 'influencer',
  tier brand_tier not null default 'new',
  channels jsonb not null default '[]',
  fee_rate numeric(5,4),
  hidden_margin_rate numeric(5,4),
  default_address jsonb,
  credit_balance_krw integer not null default 0,
  status text not null default 'active' check (status in ('active','suspended')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  level member_level not null default 'member',
  can_purchase boolean not null default false,
  invited_by uuid references profiles(id),
  joined_at timestamptz not null default now(),
  unique (brand_id, profile_id)
);

create table brand_applications (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  type brand_type not null default 'influencer',
  channels jsonb not null default '[]',
  category_focus text[] not null default '{}',
  follower_scale text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  biz_reg_no text,
  is_ecommerce_registered boolean,
  cn_content_optin boolean not null default false,
  note text,
  status application_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_brand_id uuid references brands(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 원청: 라벨·수정·홀딩·샘플 기본값의 원천. 브랜드 접근 불가.
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  market text,
  booth text,
  wechat text,
  card_image_path text,
  default_hold jsonb not null default '{"none": true}',           -- {deposit_pct, days} | {none:true}
  default_sample_ok boolean not null default true,
  default_label_options jsonb not null default '[]',               -- [{type, moq, unit_cost_cny, lead_days}]
  default_mod_options jsonb not null default '[]',                 -- [{item, moq, cost_cny, lead_days}]
  trust_score numeric(5,2),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  created_by uuid references profiles(id),
  title text not null default '',
  memo text,
  memo_zh text,
  target_date date,
  created_via text not null default 'brand' check (created_via in ('brand','admin_proxy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  seq integer not null default 1,
  category text,
  description text not null default '',
  description_zh text,
  target_price_krw integer,            -- 공급가(수수료 포함) 기준
  expected_qty_range text,
  status request_item_status not null default 'received',
  owner_role owner_role,
  due_at timestamptz,
  assigned_to uuid references profiles(id),
  sla_date date,
  ai_tags jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table request_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  request_item_id uuid references request_items(id) on delete set null,
  brand_id uuid not null references brands(id) on delete cascade,
  storage_path text,
  source_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id),
  created_by uuid references profiles(id),
  code text unique,                                   -- OS-26FW-0001, 공개 시 발급
  status product_status not null default 'draft',
  owner_role owner_role,
  due_at timestamptz,
  category text,
  name_zh text,
  name_ko text,
  desc_zh text,
  desc_ko text,
  fabric jsonb not null default '[]',                 -- [{material_code, pct}]
  origin text default 'CN',
  care_codes text[] not null default '{}',
  quality_note_zh text,
  quality_note_ko text,
  show_quality_note boolean not null default false,
  supply_type supply_type,
  lead_days integer,
  production_moq integer,
  min_qty integer,
  weight_g integer,
  verified_in_person boolean not null default false,
  verified_at timestamptz,
  verified_place text,
  sample_ok boolean not null default true,
  sample_cost_cny numeric(10,2),
  hold_override jsonb,
  label_options_override jsonb,
  mod_options_override jsonb,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejected_reasons text[] not null default '{}',
  recheck_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 원가·원청 코드: 별도 테이블. 브랜드 역할은 SELECT 권한 자체가 없다.
create table product_costs (
  product_id uuid primary key references products(id) on delete cascade,
  tiers jsonb not null default '[]',                  -- [{min_qty, cost_cny}]
  vendor_code text,
  source_market text,
  notes text,
  updated_at timestamptz not null default now()
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_path text not null,
  kind image_kind not null default 'real',
  source image_source not null default 'own',
  usable_for_sales boolean not null default false,
  sort_order integer not null default 0,
  color_id uuid,
  created_at timestamptz not null default now()
);

create table product_colors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name_zh text,
  name_ko text,
  hex text,
  sort_order integer not null default 0
);

create table product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  measurements jsonb not null default '{}',
  source size_source not null default 'vendor',
  sort_order integer not null default 0
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  color_id uuid not null references product_colors(id) on delete cascade,
  size_id uuid not null references product_sizes(id) on delete cascade,
  sku text,
  unique (product_id, color_id, size_id)
);

-- 제안 = 상품 1 × 브랜드 1 × 항목 1 × 가격 고정 (PRD D8)
create table offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  request_item_id uuid references request_items(id) on delete set null,
  type offer_type not null default 'request',
  status offer_status not null default 'new',
  reaction reaction,
  decline_reason decline_reason,
  decline_note text,
  decline_note_zh text,
  price_tiers jsonb not null,                         -- [{min_qty, product_price_krw}]
  fee_rate numeric(5,4) not null,
  hidden_margin_rate numeric(5,4) not null,           -- 브랜드 비노출
  fx_rate numeric(10,4) not null,                     -- 브랜드 비노출
  sample_fee_product_krw integer,
  valid_until date not null,
  exclusive_until date,
  issued_by uuid references profiles(id),
  issued_at timestamptz not null default now(),
  reacted_by uuid references profiles(id),
  reacted_at timestamptz,
  admin_comment text,
  owner_role owner_role,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, brand_id, request_item_id)
);

create table sample_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  requested_by uuid references profiles(id),
  status sample_request_status not null default 'requested',
  owner_role owner_role,
  due_at timestamptz,
  ship_to jsonb,
  logistics_fee_krw integer not null default 0,
  product_fee_total_krw integer not null default 0,
  payment_required boolean not null default false,
  payment_reported_at timestamptz,
  payment_confirmed_at timestamptz,
  cn_tracking text,
  cn_shipped_at timestamptz,
  kr_arrived_at timestamptz,
  inspected_at timestamptz,
  kr_tracking text,
  sent_at timestamptz,
  delivered_at timestamptz,
  feedback_due date,
  return_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sample_items (
  id uuid primary key default gen_random_uuid(),
  sample_request_id uuid not null references sample_requests(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  offer_id uuid not null references offers(id),
  variant_id uuid not null references product_variants(id),
  qty integer not null default 1 check (qty >= 1),
  status sample_item_status not null default 'pending',
  inspection_id uuid,
  feedback reaction,
  feedback_note text,
  feedback_note_zh text,
  return_status return_status not null default 'due',
  returned_at timestamptz,
  charge_status charge_status not null default 'none',
  charged_krw integer not null default 0,
  deducted_in_order_id uuid,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  created_by uuid references profiles(id),
  status order_status not null default 'reserved',
  owner_role owner_role,
  due_at timestamptz,
  gb_open_date date,
  gb_close_date date,
  delivery_promise_date date,
  hold_choice hold_choice not null default 'none',
  hold_ack boolean not null default false,            -- 홀딩 없이 진행 시 고지 동의
  deposit_krw integer,
  deposit_reported_at timestamptz,
  deposit_confirmed_at timestamptz,
  route order_route not null default 'inspect',
  logistics_quote_range jsonb,
  logistics_quote_final_krw integer,
  quote_note text,
  label_selections jsonb not null default '[]',
  mod_requests jsonb not null default '[]',
  invoice_snapshot jsonb,
  admin_memo text,
  qty_change_count integer not null default 0,
  admin_waived boolean not null default false,
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  cn_shipped_at timestamptz,
  kr_inspected_at timestamptz,
  inspection_id uuid,
  sent_at timestamptz,
  delivered_at timestamptz,
  report_due date,
  report jsonb,
  credit_issued_krw integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  offer_id uuid not null references offers(id),
  variant_id uuid not null references product_variants(id),
  expected_qty integer not null default 0,
  qty integer not null default 0,
  unit_price_krw integer,
  stock_result stock_result not null default 'pending',
  confirmed_qty integer,
  backorder_status backorder_status not null default 'none',
  backorder_qty integer not null default 0,
  backorder_eta date,
  backorder_log jsonb not null default '[]',
  unique (order_id, variant_id)
);

create table inspection_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  checklist jsonb not null default '[]'
);

create table inspections (
  id uuid primary key default gen_random_uuid(),
  type inspection_type not null,
  target_id uuid not null,                            -- sample_request_id | order_id
  brand_id uuid references brands(id),
  template_id uuid references inspection_templates(id),
  results jsonb not null default '[]',                -- [{field, expected, actual, match, note}]
  photos text[] not null default '{}',
  defect_qty integer not null default 0,
  info_match_rate numeric(5,2),
  inspected_by uuid references profiles(id),
  inspected_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('request','request_item','offer','sample_request','order','order_line')),
  target_id uuid not null,
  brand_id uuid references brands(id) on delete cascade,
  author_id uuid references profiles(id),
  visibility comment_visibility not null default 'brand',
  body_ko text,
  body_zh text,
  created_at timestamptz not null default now()
);

create table cn_questions (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references request_items(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  product_id uuid references products(id),
  asked_by uuid references profiles(id),
  body_zh text not null,
  body_ko text,
  options jsonb not null default '[]',
  admin_gate_until timestamptz not null,
  released_at timestamptz,
  held_by_admin boolean not null default false,
  answer text,
  answer_zh text,
  answered_by uuid references profiles(id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table export_packages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  product_ids uuid[] not null,
  shop_type shop_type not null,
  files jsonb not null default '[]',
  status text not null default 'pending',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  kind notification_kind not null default 'instant',
  type text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  sent_at timestamptz,
  channel text,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table settings_history (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create table glossary (
  id uuid primary key default gen_random_uuid(),
  term_zh text not null,
  term_ko text not null,
  category text,
  approved boolean not null default false,
  added_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (term_zh, term_ko)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb,
  on_behalf_of_brand_id uuid references brands(id),
  created_at timestamptz not null default now()
);

-- updated_at 트리거
do $$ declare t text; begin
  foreach t in array array['profiles','brands','brand_applications','vendors','requests','request_items','products','offers','sample_requests','orders']
  loop execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at()', t, t); end loop;
end $$;

-- settings 변경 이력 트리거
create or replace function log_settings_change() returns trigger language plpgsql as $$
begin
  insert into settings_history(key, old_value, new_value, changed_by) values (new.key, old.value, new.value, new.updated_by);
  return new;
end $$;
create trigger trg_settings_history after update on settings for each row execute function log_settings_change();

-- 인덱스
create index on request_items(brand_id, status);
create index on request_items(assigned_to, status);
create index on products(status);
create index on offers(brand_id, status);
create index on offers(product_id);
create index on sample_requests(brand_id, status);
create index on orders(brand_id, status);
create index on comments(target_type, target_id);
create index on notifications(recipient_id, read_at);
