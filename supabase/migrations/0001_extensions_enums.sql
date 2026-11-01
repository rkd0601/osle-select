-- 0001 확장·enum. PRD 4장.
create extension if not exists "pgcrypto";

do $$ begin
  create type role_code as enum ('ADMIN','CN_SOURCER','CN_VENDOR','BRAND_OWNER','BRAND_MEMBER');
exception when duplicate_object then null; end $$;

do $$ begin create type owner_role as enum ('ADMIN','CN','BRAND'); exception when duplicate_object then null; end $$;
do $$ begin create type brand_tier as enum ('new','proven'); exception when duplicate_object then null; end $$;
do $$ begin create type brand_type as enum ('influencer','brand'); exception when duplicate_object then null; end $$;
do $$ begin create type member_level as enum ('owner','member'); exception when duplicate_object then null; end $$;
do $$ begin create type application_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;

do $$ begin create type request_item_status as enum
  ('received','needs_info','assigned','sourcing','offered','selected','closed','on_hold','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type product_status as enum
  ('draft','pending_review','reviewed','offering','repool','rejected','recheck','hidden');
exception when duplicate_object then null; end $$;

do $$ begin create type supply_type as enum ('stock','production','mixed'); exception when duplicate_object then null; end $$;
do $$ begin create type image_kind as enum ('real','model','detail','label','size_chart'); exception when duplicate_object then null; end $$;
do $$ begin create type image_source as enum ('own','vendor','reference'); exception when duplicate_object then null; end $$;
do $$ begin create type size_source as enum ('vendor','measured'); exception when duplicate_object then null; end $$;

do $$ begin create type offer_type as enum ('request','reoffer','recommend'); exception when duplicate_object then null; end $$;
do $$ begin create type offer_status as enum
  ('new','interested','hold','declined','recheck','reconsent_pending','expired');
exception when duplicate_object then null; end $$;
do $$ begin create type reaction as enum ('interested','hold','declined'); exception when duplicate_object then null; end $$;
do $$ begin create type decline_reason as enum ('price','design','fabric','leadtime','other'); exception when duplicate_object then null; end $$;

do $$ begin create type sample_request_status as enum
  ('requested','awaiting_payment','cn_shipped','kr_arrived','inspected','sent_to_brand','delivered','feedback_done','closed','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin create type sample_item_status as enum ('pending','ok','defect','unavailable'); exception when duplicate_object then null; end $$;
do $$ begin create type return_status as enum ('due','returned','kept'); exception when duplicate_object then null; end $$;
do $$ begin create type charge_status as enum ('none','charged','deducted'); exception when duplicate_object then null; end $$;

do $$ begin create type order_status as enum
  ('reserved','stock_checking','stock_confirmed','partial_confirmed','stock_short','deposit_pending','hold_confirmed',
   'quoting','quoted','qty_confirmed','final_quoted','confirmed','cn_shipped','kr_inspecting','sent_to_brand','delivered','report_done','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin create type hold_choice as enum ('deposit','none'); exception when duplicate_object then null; end $$;
do $$ begin create type order_route as enum ('inspect','direct'); exception when duplicate_object then null; end $$;
do $$ begin create type stock_result as enum ('pending','confirmed','short'); exception when duplicate_object then null; end $$;
do $$ begin create type backorder_status as enum ('none','backordered','resolved'); exception when duplicate_object then null; end $$;

do $$ begin create type inspection_type as enum ('sample','bulk'); exception when duplicate_object then null; end $$;
do $$ begin create type comment_visibility as enum ('brand','internal','cn'); exception when duplicate_object then null; end $$;
do $$ begin create type notification_kind as enum ('instant','digest'); exception when duplicate_object then null; end $$;
do $$ begin create type shop_type as enum ('cafe24','godo','imweb','smartstore'); exception when duplicate_object then null; end $$;

-- 공통 updated_at 트리거
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 역할·브랜드 헬퍼 (JWT app_metadata 기반. PRD 6장)
create or replace function auth_role() returns role_code language sql stable as $$
  select nullif(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''), '')::role_code
$$;

create or replace function is_admin() returns boolean language sql stable as $$
  select auth_role() = 'ADMIN'
$$;

create or replace function is_cn() returns boolean language sql stable as $$
  select auth_role() in ('CN_SOURCER','CN_VENDOR')
$$;

create or replace function is_brand() returns boolean language sql stable as $$
  select auth_role() in ('BRAND_OWNER','BRAND_MEMBER')
$$;
