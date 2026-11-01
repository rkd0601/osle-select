-- 0027 발주 라인 단위 중국 출고 (샘플 6단계 리뷰 2와 같은 이유). 스키마만 — 뷰는 0028.
-- 한 발주서에 여러 원청 상품이 섞이면 각 CN이 자기 라인만 출고하고, 모든 라인이 출고되면 발주서가 cn_shipped.
alter table order_lines add column if not exists cn_tracking text;
alter table order_lines add column if not exists cn_shipped_at timestamptz;

-- down
-- alter table order_lines drop column if exists cn_tracking, drop column if exists cn_shipped_at;
