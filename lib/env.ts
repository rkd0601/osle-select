/**
 * 배포 환경변수 점검 (12단계, 순수). 값은 절대 돌려주지 않고 이름과 문제 종류만 — 로그·헬스 체크에 그대로 써도 안전하게.
 * required: 없으면 앱이 동작하지 않는다(로그인·DB·크론). recommended: 없으면 기능이 꺼진다(메일·번역·WeCom·카카오).
 * production에서는 localhost·http 주소, 짧은 CRON_SECRET도 문제로 본다.
 */
export type EnvIssue = { name: string; level: "error" | "warn"; problem: "missing" | "localhost" | "insecure" | "weak" | "pair" };

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL", "CRON_SECRET"] as const;
const RECOMMENDED = ["RESEND_API_KEY", "MAIL_FROM", "ANTHROPIC_API_KEY", "WECOM_WEBHOOK_URL", "KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET"] as const;
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

export function checkEnv(env: Record<string, string | undefined>, production: boolean): EnvIssue[] {
  const v = (k: string) => env[k]?.trim() || "";
  const out: EnvIssue[] = [];
  for (const k of REQUIRED) if (!v(k)) out.push({ name: k, level: production ? "error" : "warn", problem: "missing" });
  for (const k of RECOMMENDED) if (!v(k)) out.push({ name: k, level: "warn", problem: "missing" });
  if (production) {
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"]) {
      if (!v(k)) continue;
      if (LOCAL.test(v(k))) out.push({ name: k, level: "error", problem: "localhost" });
      else if (!/^https:\/\//i.test(v(k))) out.push({ name: k, level: "error", problem: "insecure" });
    }
    if (v("CRON_SECRET") && v("CRON_SECRET").length < 32) out.push({ name: "CRON_SECRET", level: "error", problem: "weak" });
  }
  // 메일은 키·발신 주소가 짝 — 하나만 있으면 발송이 실패한다
  if (!!v("RESEND_API_KEY") !== !!v("MAIL_FROM")) out.push({ name: v("RESEND_API_KEY") ? "MAIL_FROM" : "RESEND_API_KEY", level: "warn", problem: "pair" });
  if (!!v("KAKAO_CLIENT_ID") !== !!v("KAKAO_CLIENT_SECRET")) out.push({ name: v("KAKAO_CLIENT_ID") ? "KAKAO_CLIENT_SECRET" : "KAKAO_CLIENT_ID", level: "warn", problem: "pair" });
  // 서비스 롤 키가 브라우저 노출 이름으로 들어가 있으면 치명적
  for (const k of Object.keys(env)) if (k.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE|SECRET/.test(k) && v(k)) out.push({ name: k, level: "error", problem: "insecure" });
  return out;
}

export const envErrors = (issues: EnvIssue[]) => issues.filter((i) => i.level === "error");
