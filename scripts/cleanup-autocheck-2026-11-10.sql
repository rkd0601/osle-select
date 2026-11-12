-- 버튼 전수 점검(2026-11-10) 때 만든 [자동점검]·[자동점검2], 전체 점검(2026-11-12) 때 만든 [자동점검3] 데이터 정리 — dev DB 전용, 한 번만.
-- 안내: docs/CLEANUP_AUTOCHECK_2026-11-10.md
-- 실행: Supabase 대시보드(dev 프로젝트) → SQL Editor에 이 파일 전체를 붙여 넣고 Run.
--   ① 맨 위 확인 블록이 ID·제목·상품 코드가 그대로인지 검사하고, 다르면 아무것도 지우지 않고 멈춘다.
--   ② 전부 한 트랜잭션이라 중간에 오류가 나면 전부 되돌아간다.
--   ③ 마지막 SELECT가 남은 건수(모두 0이어야 함)를 보여 준다.
-- 지우지 않는 것: audit_logs(감사 기록은 남긴다), 숨김 처리된 "E2E …" 상품(scripts/cleanup-e2e.ts 담당), Storage 파일(안내 문서 참고).

begin;

drop table if exists pg_temp._ac;
create temp table _ac (kind text not null, id uuid not null);
insert into _ac (kind, id) values
  ('request',        'a49b5976-0231-4738-b0fa-00c1004b81d2'),
  ('request',        '6150ae4c-60c6-4f22-a644-6883967eb6ac'),
  ('request_item',   '6365af1a-5f3e-4967-972b-3d2d32077614'),
  ('request_item',   '751df08b-ec6f-4805-a641-9606fa7fed8e'),
  ('product',        '207540a2-7c49-4463-b141-2cf1fb4a1450'),
  ('product',        '4b044fb9-fd21-4b6a-8a6b-64d3ab4cb738'),
  ('offer',          '37d7c981-5fe6-46fe-9888-e5448283faf2'),
  ('offer',          'ac99fe66-dbd2-445c-9b9c-2a31a30a25d7'),
  ('sample_request', 'fa1c2660-c25b-46b4-a9a0-8619a1e32310'),
  ('sample_request', '0127b764-a89a-4554-ab34-67efe4c6f578'),
  ('sample_request', '2b6fa88f-911b-43bc-9d3b-4a22a86f9971'),
  ('sample_request', 'f9c1b9e7-7516-46be-9cc0-f4fe014454cc'),
  ('order',          'bafd7640-1e6f-4b08-944e-f31582e98d12'),
  ('order',          'b1e75df6-ba82-4374-95a9-70deaaab0f42'),
  ('export_package', '4091322c-3058-45e4-aae6-9451b42b218d'),
  -- [자동점검3] (2026-11-12)
  ('request',        'cb53a20e-216e-4d6c-b5c4-d121e46f351e'),
  ('request_item',   '0b3aca95-c12a-40a3-8c89-f6f345fa5f9f'),
  ('product',        '1c3f8b2b-77f0-4452-adcc-803b251c8c04'),
  ('product',        'ee48fd40-7f80-4735-84f0-35137aa2a697'),
  ('offer',          'f27d9b5b-92f7-4ab1-ac51-47d260d59a23'),
  ('offer',          '71735b4f-47a6-474a-9ed4-bbf90de53960'),
  ('sample_request', '238b70f9-d088-4967-be89-c4ed42d40ab6'),
  ('sample_request', '5bc6cdc6-731f-46d2-8cb3-f3576bd58a83'),
  ('order',          '53d08c74-db77-48fc-912d-0bd33de81561'),
  ('order',          'aaaa1bc6-ded9-4a68-9571-3449cd24765f');

-- ① 확인: 대상이 점검 데이터가 맞는지. 하나라도 어긋나면 예외 → 트랜잭션 전체 취소
do $$
declare n int;
begin
  select count(*) into n from requests
   where id in (select id from _ac where kind = 'request') and title like '[자동점검%';
  if n <> 3 then raise exception '요청 3건이 [자동점검] 제목이 아니다 (찾음 %건) — 중단', n; end if;

  select count(*) into n from products
   where id in (select id from _ac where kind = 'product') and code in ('OS-26FW-0004', 'OS-26FW-0005', 'OS-26FW-0006', 'OS-26FW-0007') and name_ko like '[자동점검%';
  if n <> 4 then raise exception '상품 OS-26FW-0004~0007이 [자동점검] 상품이 아니다 (찾음 %건) — 중단', n; end if;

  -- 샘플·발주는 점검 제안(offer)만 담고 있어야 한다 (다른 상품이 섞여 있으면 지우지 않는다)
  select count(*) into n from sample_items
   where sample_request_id in (select id from _ac where kind = 'sample_request')
     and offer_id not in (select id from _ac where kind = 'offer');
  if n <> 0 then raise exception '샘플 요청서에 점검 외 상품 %건이 있다 — 중단', n; end if;

  select count(*) into n from order_lines
   where order_id in (select id from _ac where kind = 'order')
     and offer_id not in (select id from _ac where kind = 'offer');
  if n <> 0 then raise exception '발주서에 점검 외 상품 %건이 있다 — 중단', n; end if;

  -- 점검 외 샘플이 이 발주에 물류비 청구로 묶여 있으면 멈춘다
  select count(*) into n from sample_requests
   where logistics_billed_order_id in (select id from _ac where kind = 'order')
     and id not in (select id from _ac where kind = 'sample_request');
  if n <> 0 then raise exception '점검 외 샘플 %건이 이 발주에 물류비로 묶여 있다 — 중단', n; end if;

  -- 내보내기 묶음은 점검 상품만 담고 있어야 한다
  select count(*) into n from export_packages
   where id in (select id from _ac where kind = 'export_package')
     and not (product_ids <@ array(select id from _ac where kind = 'product'));
  if n <> 0 then raise exception '내보내기 묶음에 점검 외 상품이 있다 — 중단'; end if;
end $$;

-- ② 삭제 (외래 키 순서대로)
-- 알림: 링크가 점검 데이터 화면을 가리키는 것
delete from notifications n
 using _ac a
 where a.kind in ('request', 'product', 'offer', 'sample_request', 'order')
   and n.link_path like '%' || a.id::text || '%';

-- 코멘트·검품·SLA 알림 기록 (외래 키 없이 id만 들고 있는 표)
delete from comments    where target_id in (select id from _ac);
delete from inspections where target_id in (select id from _ac where kind in ('sample_request', 'order'));
delete from sla_alerts  where entity_id in (select id from _ac);

-- 샘플 (sample_items는 offer·variant를 참조하므로 상품보다 먼저)
delete from sample_items    where sample_request_id in (select id from _ac where kind = 'sample_request');
delete from sample_requests where id in (select id from _ac where kind = 'sample_request');

-- 발주 (order_lines·export_snapshots는 on delete cascade)
delete from orders where id in (select id from _ac where kind = 'order');

-- 내보내기 묶음 · 제안 · 상품 (상품 원가·사진·컬러·사이즈·variant는 cascade)
delete from export_packages where id in (select id from _ac where kind = 'export_package');
delete from offers          where id in (select id from _ac where kind = 'offer');
delete from products        where id in (select id from _ac where kind = 'product');

-- 요청 (항목·링크·중국 질문은 cascade)
delete from requests where id in (select id from _ac where kind = 'request');

commit;

-- ③ 남은 건수 — 전부 0이어야 한다 (커밋 뒤 확인)
select 'requests' as t, count(*) from requests where id in (select id from _ac)
union all select 'request_items',   count(*) from request_items   where id in (select id from _ac)
union all select 'products',        count(*) from products        where id in (select id from _ac)
union all select 'offers',          count(*) from offers          where id in (select id from _ac)
union all select 'sample_requests', count(*) from sample_requests where id in (select id from _ac)
union all select 'orders',          count(*) from orders          where id in (select id from _ac)
union all select 'export_packages', count(*) from export_packages where id in (select id from _ac)
union all select 'comments',        count(*) from comments        where target_id in (select id from _ac);

-- 임시 표 _ac는 SQL Editor 세션이 끝나면 저절로 사라진다
