import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEV_ACCOUNTS, devQuickLoginEnabled } from "@/lib/auth/dev-login";
import ko from "@/lib/i18n/ko.json";

/** 개발용 빠른 로그인은 로컬 next dev에서만 — 운영·Vercel 빌드에서 켜지면 비밀번호 없이 로그인된다 */
describe("devQuickLoginEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("production이면 꺼진다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_DEV_PASSWORD", "x");
    expect(devQuickLoginEnabled()).toBe(false);
  });
  it("Vercel이면 development여도 꺼진다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_DEV_PASSWORD", "x");
    vi.stubEnv("VERCEL", "1");
    expect(devQuickLoginEnabled()).toBe(false);
  });
  it("비밀번호 환경변수가 없으면 꺼진다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("LOCAL_DEV_PASSWORD", "");
    expect(devQuickLoginEnabled()).toBe(false);
  });
  it("로컬 dev + 비밀번호면 켜진다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("LOCAL_DEV_PASSWORD", "x");
    expect(devQuickLoginEnabled()).toBe(true);
  });
  it("계정은 시드 계정만, 라벨 키는 ko 사전에 있다", () => {
    const seed = readFileSync("supabase/seed.sql", "utf8");
    for (const a of DEV_ACCOUNTS) {
      expect(seed).toContain(`'${a.email}'`);
      expect((ko as Record<string, string>)[a.labelKey], a.labelKey).toBeTruthy();
    }
  });
});
