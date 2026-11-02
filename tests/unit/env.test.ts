import { describe, it, expect } from "vitest";
import { checkEnv, envErrors } from "@/lib/env";

const PROD_OK = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc",
  NEXT_PUBLIC_APP_URL: "https://select.osle.shop", CRON_SECRET: "x".repeat(40),
  RESEND_API_KEY: "re_x", MAIL_FROM: "noreply@osle.shop", ANTHROPIC_API_KEY: "sk", WECOM_WEBHOOK_URL: "https://qyapi", KAKAO_CLIENT_ID: "k", KAKAO_CLIENT_SECRET: "s",
};

describe("배포 환경변수 점검 (12단계)", () => {
  it("운영 정상 값이면 문제 없음", () => {
    expect(checkEnv(PROD_OK, true)).toEqual([]);
  });
  it("필수 누락은 운영 error · 로컬 warn", () => {
    const { CRON_SECRET: _c, ...rest } = PROD_OK;
    void _c;
    expect(checkEnv(rest, true)).toEqual([{ name: "CRON_SECRET", level: "error", problem: "missing" }]);
    expect(checkEnv(rest, false)).toEqual([{ name: "CRON_SECRET", level: "warn", problem: "missing" }]);
  });
  it("운영에서 localhost·http 주소, 짧은 CRON_SECRET은 error", () => {
    const issues = checkEnv({ ...PROD_OK, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_APP_URL: "http://select.osle.shop", CRON_SECRET: "short" }, true);
    expect(envErrors(issues).map((i) => `${i.name}:${i.problem}`)).toEqual(["NEXT_PUBLIC_SUPABASE_URL:localhost", "NEXT_PUBLIC_APP_URL:insecure", "CRON_SECRET:weak"]);
    expect(checkEnv({ ...PROD_OK, NEXT_PUBLIC_APP_URL: "http://localhost:3000" }, false)).toEqual([]);
  });
  it("메일·카카오는 짝으로, 서비스 롤 키를 NEXT_PUBLIC_ 이름에 넣으면 error", () => {
    expect(checkEnv({ ...PROD_OK, MAIL_FROM: "" }, true)).toEqual([{ name: "MAIL_FROM", level: "warn", problem: "missing" }, { name: "MAIL_FROM", level: "warn", problem: "pair" }]);
    expect(envErrors(checkEnv({ ...PROD_OK, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "svc" }, true))).toEqual([{ name: "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", level: "error", problem: "insecure" }]);
  });
  it("결과에 값이 들어가지 않는다", () => {
    const s = JSON.stringify(checkEnv({ ...PROD_OK, CRON_SECRET: "leakme", NEXT_PUBLIC_APP_URL: "http://secret-host" }, true));
    expect(s).not.toContain("leakme");
    expect(s).not.toContain("secret-host");
  });
});
