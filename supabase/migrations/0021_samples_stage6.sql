-- 0021 6단계 샘플 스키마 (B-06·B-07·C-05·A-05). 스키마만 — 뷰·권한은 0022.
-- 결제·PG·세금계산서 필드는 두지 않는다(절대 규칙 13). 입금은 "신고(payment_reported_at)"와 "확인(payment_confirmed_at)" 플래그뿐.

-- 항목(variant×수량) 단위로 고정·추적하는 값
alter table sample_items add column if not exists product_price_krw integer;              -- 요청 시점 미회수 청구 단가(= offer.sample_fee_product_krw) 고정
alter table sample_items add column if not exists inspection_photo_path text;              -- A-05 검품 사진 1장 (sample-photos 버킷)
alter table sample_items add column if not exists inspection_defect text;                  -- 불량 템플릿 코드 (settings.inspection_defects)
alter table sample_items add column if not exists inspection_note_internal text;           -- 관리자 내부 메모 — 브랜드·CN 비노출
alter table sample_items add column if not exists inspected_at timestamptz;
alter table sample_items add column if not exists return_tracking text;                    -- 브랜드 → 위아더 반납 운송장
alter table sample_items add column if not exists return_requested_at timestamptz;
alter table sample_items add column if not exists charged_at timestamptz;
alter table sample_items add column if not exists library_location text;                   -- 회수 샘플 보관 위치 (샘플 라이브러리)
alter table sample_items add column if not exists feedback_reason decline_reason;           -- 거절 사유 템플릿 (B-04와 같은 어휘)

-- 요청서: 수령 주소 기본값(브랜드)과 같은 구조. 금액은 요청 시점 고정(logistics_fee_krw·product_fee_total_krw 기존)
alter table sample_requests add column if not exists payment_note text;                   -- 입금자명 등 브랜드 신고 메모

create index if not exists sample_requests_brand_status_idx on sample_requests(brand_id, status);
create index if not exists sample_items_offer_idx on sample_items(offer_id);

-- down
-- alter table sample_items drop column if exists product_price_krw, drop column if exists inspection_photo_path, drop column if exists inspection_defect,
--   drop column if exists inspection_note_internal, drop column if exists inspected_at, drop column if exists return_tracking,
--   drop column if exists return_requested_at, drop column if exists charged_at, drop column if exists library_location, drop column if exists feedback_reason;
-- alter table sample_requests drop column if exists payment_note;
