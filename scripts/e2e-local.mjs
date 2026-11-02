// 로컬 E2E: 로컬 Supabase(시드 적용) + next dev 를 대상으로 Playwright를 돌린다.
//   pnpm supabase start && pnpm supabase db reset   (처음 한 번, 시드 적용)
//   pnpm e2e:local [playwright 인자…]
// E2E_BASE_URL이 없으면 http://localhost:3000 을 쓰고, playwright.config의 webServer가 dev 서버를 띄운다(이미 떠 있으면 재사용).
import { spawnSync } from "node:child_process";

const env = { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000", E2E_LOCAL: "1" };
const status = spawnSync("pnpm", ["supabase", "status"], { env, shell: true, encoding: "utf8" });
if (status.status !== 0) {
  console.error("로컬 Supabase가 꺼져 있다 — `pnpm supabase start` 후 `pnpm supabase db reset`(시드)을 먼저 실행하세요.");
  process.exit(1);
}
const r = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { env, shell: true, stdio: "inherit" });
process.exit(r.status ?? 1);
