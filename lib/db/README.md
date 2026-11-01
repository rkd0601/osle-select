# lib/db

- `types.ts` 는 `pnpm supabase gen types typescript --local > lib/db/types.ts` 로 생성한다. 수동 수정 금지.
- `brand/` : 브랜드 세션 쿼리. **`from('products')`, `from('product_costs')`, `from('vendors')` 금지.** `v_*_brand` 뷰만 사용.
- `cn/`    : 중국 소싱 세션 쿼리. 요청 항목은 `v_request_items_cn` 뷰.
- `admin/` : 관리자 쿼리. 원가·원청·설정은 서비스 롤(`lib/supabase/admin.ts`)로.
