-- 0046 B-10 브랜드 주소(slug) 변경 요청 (DECISIONS 9-8: 브랜드가 요청 → 관리자 승인, URL이 바뀌면 기존 링크가 깨지므로 승인제). 스키마만 — RLS는 0047.
create table if not exists brand_change_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null default 'slug' check (kind in ('slug')),
  value text not null check (value ~ '^[a-z0-9-]{3,40}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_by uuid references profiles(id),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- 브랜드당 대기 요청 1건
create unique index if not exists brand_change_requests_one_pending on brand_change_requests (brand_id, kind) where status = 'pending';

-- down
-- drop table if exists brand_change_requests;
