-- 0023 7단계 발주 스키마 (B-08·A-06·B-09·C-05). 스키마만 — 뷰·권한은 0024. 결제·PG·세금계산서 필드 없음(절대 규칙 13).

alter table orders add column if not exists deposit_pct numeric(4,3);                 -- 예약 시 상품 홀딩 조건(선금 %) 고정
alter table orders add column if not exists deposit_note text;                         -- 입금자명 등 브랜드 신고 메모
alter table orders add column if not exists quoted_at timestamptz;
alter table orders add column if not exists qty_confirmed_at timestamptz;
alter table orders add column if not exists final_quoted_at timestamptz;
alter table orders add column if not exists report_submitted_at timestamptz;

alter table order_lines add column if not exists cn_note text;                         -- 재고 응답 메모(zh, CN 입력)
alter table order_lines add column if not exists defect_qty integer not null default 0; -- 도착 검수 보고 불량 수량(브랜드)
alter table order_lines add column if not exists inspected_ok_qty integer;              -- 위아더 본품 검품 통과 수량

create index if not exists orders_brand_status_idx on orders(brand_id, status);
create index if not exists order_lines_offer_idx on order_lines(offer_id);

-- down
-- alter table orders drop column if exists deposit_pct, drop column if exists deposit_note, drop column if exists quoted_at,
--   drop column if exists qty_confirmed_at, drop column if exists final_quoted_at, drop column if exists report_submitted_at;
-- alter table order_lines drop column if exists cn_note, drop column if exists defect_qty, drop column if exists inspected_ok_qty;
