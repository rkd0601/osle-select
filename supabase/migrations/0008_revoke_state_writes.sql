-- 0008 상태 객체 직접 쓰기 차단 + 중국어 원문 컬럼 비노출. CLAUDE.md 절대 규칙 1·4.
-- 0003의 brand/cn insert·update 정책은 anon 키만으로 status·owner_role·due_at·assigned_to를 바꿀 수 있게 했다.
-- 상태가 있는 테이블의 쓰기는 Server Action(역할·멤버십 검증 → assertTransition → ownerAndDue → 서비스 롤)만 수행한다.
-- RLS 정책은 그대로 둔다(권한이 다시 열려도 행 필터가 남도록 하는 방어 겹).
-- 되돌리기: 아래 "-- down" 블록.

revoke insert, update on
  requests, request_items, request_images, products, offers,
  sample_requests, sample_items, orders, order_lines, cn_questions
from authenticated;

-- requests.memo_zh, request_items.description_zh 는 브랜드 응답에 실리면 안 된다(보안 테스트: `_zh` 키 금지).
-- authenticated는 한 롤이라 역할별 grant가 안 되므로 컬럼 단위로 select를 준다.
-- CN은 v_request_items_cn(definer), ADMIN 화면은 서비스 롤로 중국어 원문을 읽는다.
revoke select on requests, request_items from authenticated;
grant select (id, brand_id, created_by, title, memo, target_date, created_via, created_at, updated_at) on requests to authenticated;
grant select (id, request_id, brand_id, seq, category, description, target_price_krw, expected_qty_range,
              status, owner_role, due_at, assigned_to, sla_date, ai_tags, created_at, updated_at) on request_items to authenticated;

-- 0007 이후 Supabase 기본 권한으로 anon에 붙은 것 정리
revoke all on brand_invites from anon;

-- down
-- grant insert, update on requests, request_items, request_images, products, offers,
--   sample_requests, sample_items, orders, order_lines, cn_questions to authenticated;
-- revoke select on requests, request_items from authenticated;
-- grant select on requests, request_items to authenticated;
