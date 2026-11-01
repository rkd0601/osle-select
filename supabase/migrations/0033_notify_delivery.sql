-- 0033 8단계 알림 채널·배치 (스키마). 권한은 0034.
-- 인앱은 notifications 행 자체, 이메일·WeCom 발송은 배치(deliver)가 기록·재시도한다. 상태 전이와 분리(알림 실패로 되돌리지 않음).
alter table notifications add column if not exists email_sent_at timestamptz;
alter table notifications add column if not exists wecom_sent_at timestamptz;
alter table notifications add column if not exists digest_sent_at timestamptz;     -- digest 묶음에 포함된 시각
alter table notifications add column if not exists attempts integer not null default 0;
alter table notifications add column if not exists delivery_error text;
alter table notifications add column if not exists entity text;                    -- 묶음 키 (예: offer, sample_request)
alter table notifications add column if not exists entity_id uuid;
create index if not exists notifications_delivery_idx on notifications(kind, email_sent_at, wecom_sent_at) where email_sent_at is null or wecom_sent_at is null;

-- 수신 설정: digest만 끌 수 있다(instant = 공이 넘어옴은 항상). WeCom 그룹 봇 멘션용 담당자명
alter table profiles add column if not exists notify_digest boolean not null default true;
alter table profiles add column if not exists wecom_name text;

-- SLA 기한 초과 알림 1회(재알림 간격) 기록 — 객체별
create table if not exists sla_alerts (
  entity text not null,
  entity_id uuid not null,
  due_at timestamptz not null,
  alerted_at timestamptz not null default now(),
  primary key (entity, entity_id, due_at)
);
alter table sla_alerts enable row level security;   -- 정책 없음 = 서비스 롤만

-- down
-- drop table if exists sla_alerts;
-- alter table profiles drop column if exists notify_digest, drop column if exists wecom_name;
-- alter table notifications drop column if exists email_sent_at, drop column if exists wecom_sent_at, drop column if exists digest_sent_at,
--   drop column if exists attempts, drop column if exists delivery_error, drop column if exists entity, drop column if exists entity_id;
