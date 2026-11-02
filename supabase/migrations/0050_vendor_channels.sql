-- 0050 원청별 WeCom 웹훅 (DECISIONS r6-4: CN_VENDOR 활성화 전에 그룹 봇 1개 → 원청별로 분리).
-- vendors에 두지 않는다 — CN 세션이 vendors 행을 읽을 수 있어(vendors_cn_select) 웹훅 키가 다른 원청에 보인다. 별도 테이블, 서비스 롤만(0051).
-- 스키마만 — RLS·권한은 0051.
create table if not exists vendor_channels (
  vendor_id uuid primary key references vendors(id) on delete cascade,
  wecom_webhook text check (wecom_webhook ~ '^https://qyapi\.weixin\.qq\.com/cgi-bin/webhook/send\?key=[A-Za-z0-9-]+$'),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- down
-- drop table if exists vendor_channels;
