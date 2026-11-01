-- 0012 상품 하위 테이블·원청 직접 쓰기 차단 (CLAUDE.md 절대 규칙 2 "쓰기는 서버 액션만").
-- 0003은 CN이 product_images/colors/sizes/variants를 직접 쓰고 vendors를 직접 insert하게 열어 두었다.
-- 공개 조건(사진 5장·컬러·사이즈)과 재확인(D16) 판정이 이 테이블들에 걸려 있으므로, 쓰기는 서버 액션이
-- 소유(products.created_by)·상태를 검증한 뒤 서비스 롤로만 한다. 읽기(RLS)는 그대로.

revoke insert, update on product_images, product_colors, product_sizes, product_variants from authenticated;
drop policy if exists vendors_cn_insert on vendors;

-- down
-- grant insert, update on product_images, product_colors, product_sizes, product_variants to authenticated;
-- create policy vendors_cn_insert on vendors for insert to authenticated with check (is_cn());
