-- 0014 5단계 검수·발행 스키마 (A-03·A-04·B-04·B-05). 스키마·함수만 — 뷰·권한은 0015.

-- 발행 시점에 고정되는 브랜드 노출 금액 (CLAUDE.md 절대 규칙 3·5)
--   option_prices: 라벨·행택·수정 옵션 KRW {labels:[{type,moq,unit_price_krw,lead_days}], mods:[{item,moq,price_krw,lead_days}]} — 원가 키 없음
--   sample_logistics_krw: 샘플 물류비 1벌 기준(특송 kg당 × 중량 + 국내 배송). 중량은 브랜드에 노출하지 않고 금액만
alter table offers add column if not exists option_prices jsonb not null default '{"labels":[],"mods":[]}';
alter table offers add column if not exists sample_logistics_krw integer;
-- 재확인(D16) 직전 상태: 재승인 시 가격이 같으면 이 값으로 복원 (PRD 4장)
alter table offers add column if not exists status_before_recheck offer_status;

-- A-03 번역 검증 결과: {field: {similarity, uncertain, back}} + glossary_misses[]
alter table products add column if not exists translation_meta jsonb not null default '{}';

-- 재확인 캐스케이드가 직전 상태를 남기도록 (0006 정의 대체)
create or replace function cascade_product_recheck() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'recheck' and old.status is distinct from 'recheck' then
    update offers set status_before_recheck = status, status = 'recheck', owner_role = 'ADMIN', due_at = now() + interval '1 day'
    where product_id = new.id and status in ('new','interested','hold','reconsent_pending');
  end if;
  return new;
end $$;

-- down
-- (cascade_product_recheck는 0006 정의로 되돌린다)
-- alter table products drop column if exists translation_meta;
-- alter table offers drop column if exists status_before_recheck, drop column if exists sample_logistics_krw, drop column if exists option_prices;
