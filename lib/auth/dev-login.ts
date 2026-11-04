/**
 * 개발용 빠른 로그인 설정 (화면 테스트용). 로컬 `next dev` + LOCAL_DEV_PASSWORD가 있을 때만 켜진다.
 * 운영·스테이징 빌드는 NODE_ENV=production → 버튼도 서버 액션도 꺼진다. 계정은 supabase/seed.sql 과 같다.
 */
export const DEV_ACCOUNTS = [
  { email: "owner@osle-muz.example", labelKey: "login.dev.brandAOwner" },
  { email: "md@osle-muz.example", labelKey: "login.dev.brandAMember" },
  { email: "owner@brand-b.example", labelKey: "login.dev.brandBOwner" },
  { email: "admin@wearethe.co.kr", labelKey: "login.dev.admin" },
  { email: "cn.wang@wearethe.co.kr", labelKey: "login.dev.cnSourcer" },
  { email: "vendor@zhongzhou.example", labelKey: "login.dev.cnVendor" },
] as const;

export const devQuickLoginEnabled = () => process.env.NODE_ENV === "development" && !process.env.VERCEL && !!process.env.LOCAL_DEV_PASSWORD;
