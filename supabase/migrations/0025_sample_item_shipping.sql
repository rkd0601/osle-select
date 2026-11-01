-- 0025 샘플 항목 단위 중국 출고 (6단계 리뷰 2). 스키마만 — 권한은 0026.
-- 한 요청서에 여러 CN(원청)의 상품이 섞이면 각자 자기 항목을 출고한다. 모든 항목이 출고되면 요청서가 cn_shipped.
alter table sample_items add column if not exists cn_tracking text;
alter table sample_items add column if not exists cn_shipped_at timestamptz;

-- down
-- alter table sample_items drop column if exists cn_tracking, drop column if exists cn_shipped_at;
