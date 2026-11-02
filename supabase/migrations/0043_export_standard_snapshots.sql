-- 0043 B-12 위아더 표준 패키지 + 발주 확정 시 패키지용 상품 스냅샷 (DECISIONS 9-5 · 9-7). 스키마만 — RLS·권한은 0044.
-- shop_type 'osle' = 표준 패키지(쇼핑몰 프리셋은 zip 안 presets/ 참고 파일).
alter type shop_type add value if not exists 'osle';

-- 발주 확정 순간의 상품 정보(브랜드 뷰 컬럼만 — 원가·원청·중량·환율·마진·*_zh 없음). 이후 상품이 브랜드 뷰에서 사라져도
-- 이 행으로 패키지를 만든다("제안 = 1행 고정"과 같은 결). 같은 발주서 × 상품은 1행.
create table if not exists export_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index if not exists export_snapshots_brand_product on export_snapshots (brand_id, product_id, created_at desc);

-- down
-- drop table if exists export_snapshots;
-- (enum 값 'osle'은 되돌리지 않는다 — 쓰는 행이 없으면 무해)
