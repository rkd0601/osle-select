import { defineConfig } from "@playwright/test";

/**
 * 보안 E2E (PRD 11·12장). 실제 Supabase(시드 적용) + 실행 중인 앱이 있어야 돈다.
 *   E2E_BASE_URL=http://localhost:3000 pnpm e2e        (앱이 이미 떠 있을 때)
 *   pnpm e2e:local                                     (로컬 Supabase 확인 + dev 서버 자동 기동, scripts/e2e-local.mjs)
 * E2E_BASE_URL이 없으면 모든 스펙이 skip 된다. 시드 비밀번호는 supabase/seed.sql 참고(password123, 로컬 전용).
 * 브라우저는 처음 한 번 `pnpm exec playwright install chromium`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  // pnpm e2e:local — 로컬 Supabase(시드) + dev 서버. 이미 떠 있으면 재사용
  webServer: process.env.E2E_LOCAL ? { command: "pnpm dev", url: process.env.E2E_BASE_URL ?? "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 } : undefined,
});
