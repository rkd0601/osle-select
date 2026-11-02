// PGlite(WASM Postgres)로 마이그레이션·시드·검증을 돌린다. Docker·로컬 PG 없이 Windows/macOS에서 동작.
// 사용: pnpm db:check:lite   (psql 메타 명령 `\...` 줄은 건너뛴다)
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").split("\n").filter((l) => !l.startsWith("\\")).join("\n");
const notices = [];
const db = new PGlite({ extensions: { pgcrypto } });

async function run(label, sql) {
  await db.exec(sql, { onNotice: (n) => notices.push(n.message) }).catch((e) => {
    throw new Error(`${label}: ${e.message}`);
  });
  console.log(`apply ${label}`);
}

try {
  await run("00_local_auth_shim.sql", read("tests/sql/00_local_auth_shim.sql"));
  for (const f of fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await run(f, read(`supabase/migrations/${f}`));
  }
  await run("seed.sql", read("supabase/seed.sql"));
  console.log("--- checks");
  await run("10_checks.sql", read("tests/sql/10_checks.sql"));
  notices.filter((n) => n.startsWith("PASS")).forEach((n) => console.log(n));
  // 운영 사전 점검(supabase/checks/prod_preflight.sql): 시드가 깔린 로컬에서는 시드 흔적·계좌 미입력만으로 실패해야 한다.
  // 그 밖의 항목(RLS·권한·서비스 전용 함수)이 걸리면 스키마 문제다.
  const pre = await db.exec(read("supabase/checks/prod_preflight.sql")).then(() => "PREFLIGHT OK", (e) => e.message);
  const expected = ["seed auth users", "seed brands", "seed vendors", "settings.bank_account not set"];
  const extra = pre.replace(/^.*PREFLIGHT FAILED: /, "").split(" | ").filter((x) => !expected.some((e) => x.startsWith(e)));
  if (!pre.includes("PREFLIGHT FAILED") || !pre.includes("seed auth users") || extra.length) throw new Error(`preflight: ${pre}`);
  console.log("PASS preflight: seed leftovers detected, no schema/grant problems");
  console.log("ALL CHECKS PASSED");
} catch (e) {
  notices.filter((n) => n.startsWith("PASS")).forEach((n) => console.log(n));
  console.log(`CHECKS FAILED — ${e.message}`);
  process.exit(1);
}
