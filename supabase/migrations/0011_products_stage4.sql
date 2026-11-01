-- 0011 4단계 상품 등록 스키마 (C-02·C-03·C-04). 스키마만 — 권한 변경은 0012.
-- products.source_request_item_id: C-01 "添加商品"으로 들어온 요청 항목. A-04 발행 화면이 이 항목을 기본 선택한다.
--   제안(offer) 연결과는 별개(상품은 여러 브랜드·항목에 재제안될 수 있다). 항목이 지워져도 상품은 남는다.
-- products.verified_by: 실물 확인한 담당자(카메라 직촬 등록 시 자동).

alter table products add column if not exists source_request_item_id uuid references request_items(id) on delete set null;
alter table products add column if not exists verified_by uuid references profiles(id);

create index if not exists products_created_by_status_idx on products(created_by, status);
create index if not exists products_source_item_idx on products(source_request_item_id);
create index if not exists product_colors_product_idx on product_colors(product_id);
create index if not exists product_sizes_product_idx on product_sizes(product_id);
create index if not exists vendors_created_by_idx on vendors(created_by);

-- down
-- drop index if exists products_created_by_status_idx, products_source_item_idx, product_colors_product_idx, product_sizes_product_idx, vendors_created_by_idx;
-- alter table products drop column if exists verified_by, drop column if exists source_request_item_id;
