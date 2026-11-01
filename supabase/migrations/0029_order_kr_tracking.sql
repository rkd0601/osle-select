-- 0029 발주 한국 → 브랜드 발송 운송장 (샘플 sample_requests.kr_tracking과 같은 의미). 스키마만 — 권한·뷰는 0030.
alter table orders add column if not exists kr_tracking text;

-- down
-- alter table orders drop column if exists kr_tracking;
