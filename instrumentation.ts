/**
 * 서버 시작 시 환경변수 점검 (12단계). 값은 찍지 않고 이름·문제만. 앱을 멈추지는 않는다 —
 * 크론·메일 한 가지가 빠졌다고 전체를 내리지 않고, 로그와 /api/health 로 드러낸다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("@/lib/env");
  const issues = checkEnv(process.env, process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production");
  for (const i of issues) (i.level === "error" ? console.error : console.warn)(`[env] ${i.level} ${i.name}: ${i.problem}`);
}
