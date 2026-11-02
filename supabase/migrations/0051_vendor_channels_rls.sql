-- 0051 vendor_channels RLS·권한 (별도 커밋). 정책 없음 + 세션 롤 권한 회수 = 서비스 롤(서버 액션·발송 배치)만 읽고 쓴다.
-- ADMIN 화면도 서버 액션으로만 쓰고, 화면에는 "설정됨" 여부만 내려간다(웹훅 키 비노출).
alter table vendor_channels enable row level security;
revoke all on vendor_channels from anon, authenticated;

-- down
-- alter table vendor_channels disable row level security;
