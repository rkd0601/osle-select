-- 운영 DB 사전 점검 (12단계 배포 준비). 운영(또는 스테이징 → 운영 승격 전) Supabase SQL Editor에서 실행한다.
-- 읽기만 한다. 문제가 하나라도 있으면 마지막에 예외로 끝난다 — 메시지 목록을 보고 고친 뒤 다시 실행.
-- 로컬 PGlite(시드 적용)에서는 "실패해야 정상" — tests/sql/run_pglite.mjs가 시드 흔적을 잡는지 확인한다.
do $$
declare
  problems text[] := '{}';
  n int;
begin
  -- 1) 시드 계정(비밀번호 password123)·시드 브랜드가 남아 있으면 안 된다
  select count(*) into n from auth.users where email like '%.example' or id::text like '00000000-0000-0000-0000-0000000000%';
  if n > 0 then problems := problems || format('seed auth users: %s', n); end if;
  select count(*) into n from brands where slug in ('osle', 'osle-muz', 'brand-b') or id::text like '10000000-0000-0000-0000-%';
  if n > 0 then problems := problems || format('seed brands: %s', n); end if;
  select count(*) into n from vendors where id::text like '20000000-0000-0000-0000-%';
  if n > 0 then problems := problems || format('seed vendors: %s', n); end if;

  -- 2) 테스트 전용 함수가 없어야 한다 (tests/sql/10_checks.sql의 test_login)
  if to_regprocedure('public.test_login(uuid, text)') is not null then problems := problems || 'test_login() exists'::text; end if;

  -- 3) 서비스 전용 함수는 authenticated·anon이 실행할 수 없어야 한다
  if has_function_privilege('authenticated', 'update_setting(text, jsonb, uuid, text)', 'execute') then problems := problems || 'update_setting executable by authenticated'::text; end if;
  if has_function_privilege('authenticated', 'use_brand_credit_for_order(uuid, integer)', 'execute') then problems := problems || 'use_brand_credit_for_order executable by authenticated'::text; end if;
  if has_function_privilege('anon', 'update_setting(text, jsonb, uuid, text)', 'execute') then problems := problems || 'update_setting executable by anon'::text; end if;

  -- 4) 원가·설정 테이블은 세션 롤이 직접 읽을 수 없어야 한다 (절대 규칙 1)
  if has_table_privilege('authenticated', 'product_costs', 'select') then problems := problems || 'product_costs readable by authenticated'::text; end if;
  if has_table_privilege('authenticated', 'settings', 'select') then problems := problems || 'settings readable by authenticated'::text; end if;
  if has_table_privilege('anon', 'brand_applications', 'insert') then problems := problems || 'brand_applications insertable by anon'::text; end if;
  if has_table_privilege('authenticated', 'vendor_channels', 'select') then problems := problems || 'vendor_channels readable by authenticated'::text; end if;

  -- 4-1) 원청 계정(CN_VENDOR)에 연결된 원청은 웹훅이 있어야 한다 — 없으면 WeCom 알림이 원청에 닿지 않는다 (DECISIONS r6-4)
  select count(*) into n from vendors v join auth.users u on u.id = v.owner_profile_id
    where u.raw_app_meta_data->>'role' = 'CN_VENDOR'
      and not exists (select 1 from vendor_channels c where c.vendor_id = v.id and c.wecom_webhook is not null);
  if n > 0 then problems := problems || format('CN_VENDOR vendors without wecom webhook: %s', n); end if;

  -- 5) 모든 public 테이블에 RLS가 켜져 있어야 한다
  select count(*) into n from pg_tables t join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    where t.schemaname = 'public' and not c.relrowsecurity;
  if n > 0 then problems := problems || format('tables without RLS: %s', (select string_agg(t.tablename, ',') from pg_tables t join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace where t.schemaname = 'public' and not c.relrowsecurity)); end if;

  -- 6) 운영 값: 환율·입금 계좌가 들어 있어야 한다 (입금 안내 카드)
  if not exists (select 1 from settings where key = 'fx_rate_cny_krw') then problems := problems || 'settings.fx_rate_cny_krw missing'::text; end if;
  if not exists (select 1 from settings where key = 'bank_account' and value is not null and value <> 'null'::jsonb) then problems := problems || 'settings.bank_account not set'::text; end if;

  -- 7) Storage 버킷은 전부 비공개 (Supabase에서만 — 로컬 PGlite에는 storage 스키마가 없다)
  if to_regclass('storage.buckets') is not null then
    execute 'select count(*) from storage.buckets where public' into n;
    if n > 0 then problems := problems || format('public storage buckets: %s', n); end if;
  end if;

  if array_length(problems, 1) > 0 then
    raise exception 'PREFLIGHT FAILED: %', array_to_string(problems, ' | ');
  end if;
  raise notice 'PREFLIGHT OK';
end $$;
