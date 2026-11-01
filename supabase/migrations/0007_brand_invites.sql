-- 0007 브랜드 담당자 초대 (P-03). 관리자 또는 브랜드 owner가 만들고, 초대받은 사람이 이메일 OTP 로그인 후 수락한다.
create table brand_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  brand_id uuid not null references brands(id) on delete cascade,
  email text not null,
  level member_level not null default 'member',
  can_purchase boolean not null default false,
  invited_by uuid references profiles(id),
  invited_by_name text,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on brand_invites(brand_id);
create index on brand_invites(lower(email));

alter table brand_invites enable row level security;
create policy brand_invites_admin_all on brand_invites for all to authenticated using (is_admin()) with check (is_admin());
-- owner는 자기 브랜드 초대를 만들고 볼 수 있다
create policy brand_invites_owner_select on brand_invites for select to authenticated
  using (is_brand() and exists (select 1 from brand_members m where m.brand_id = brand_invites.brand_id and m.profile_id = auth.uid() and m.level = 'owner'));
create policy brand_invites_owner_insert on brand_invites for insert to authenticated
  with check (is_brand() and invited_by = auth.uid() and exists (select 1 from brand_members m where m.brand_id = brand_invites.brand_id and m.profile_id = auth.uid() and m.level = 'owner'));
grant select, insert on brand_invites to authenticated;
-- 토큰으로 조회·수락은 서버 액션(서비스 롤)에서만 수행한다. anon에는 권한 없음.
