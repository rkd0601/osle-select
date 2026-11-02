// 스테이징 한 번에 세팅: Supabase 프로젝트 → 마이그레이션 → 시드(비밀번호 무작위화) → Auth·버킷 → Vercel 프로젝트·환경변수 → 배포 → 헬스 체크.
//   1) .env.staging.example 을 .env.staging 으로 복사하고 토큰 두 개(SUPABASE_ACCESS_TOKEN·VERCEL_TOKEN)만 채운다. 나머지 키는 있으면 넣는다.
//   2) node scripts/setup-staging.mjs          (몇 번 다시 돌려도 된다 — 이미 된 단계는 건너뛴다)
//   3) 끝나면 출력된 주소로 접속, E2E: node scripts/setup-staging.mjs --e2e
// 만든 값(프로젝트 ref·DB 비밀번호·CRON_SECRET·시드 비밀번호)은 .env.staging 에 덧붙인다(.gitignore의 .env*). 운영 세팅에는 쓰지 않는다 — 시드를 넣는다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env.staging");
const BUCKETS = ["request-images", "product-images", "vendor-cards", "sample-photos", "inspection-photos", "exports"];
const MiB50 = 50 * 1024 * 1024;

if (!fs.existsSync(envFile)) fail(".env.staging 이 없다 — .env.staging.example 을 복사해 토큰 두 개를 채우세요.");
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const save = (k, v) => { env[k] = v; fs.appendFileSync(envFile, `\n${k}=${v}`); };
const need = (k) => env[k] || fail(`.env.staging 에 ${k} 가 비어 있다`);
const rand = (n = 32) => crypto.randomBytes(n).toString("hex");
const name = env.STAGING_NAME || "osle-select-staging";

function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }
const step = (s) => console.log(`\n▶ ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(base, token, method, p, body) {
  const r = await fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  return { ok: r.ok, status: r.status, data };
}
const sb = (m, p, b) => api("https://api.supabase.com", need("SUPABASE_ACCESS_TOKEN"), m, p, b);
const team = env.VERCEL_TEAM_ID ? `teamId=${env.VERCEL_TEAM_ID}` : "";
const vc = (m, p, b) => api("https://api.vercel.com", need("VERCEL_TOKEN"), m, p + (team ? (p.includes("?") ? "&" : "?") + team : ""), b);
const must = (r, what) => (r.ok ? r.data : fail(`${what} 실패 (${r.status}): ${typeof r.data === "string" ? r.data : JSON.stringify(r.data)}`));

// ---------- Supabase ----------
async function supabase() {
  step("Supabase 프로젝트");
  let ref = env.SUPABASE_PROJECT_REF;
  if (!ref) {
    const projects = must(await sb("GET", "/v1/projects"), "프로젝트 목록");
    const found = projects.find((p) => p.name === name);
    if (found) ref = found.id;
    else {
      const orgs = must(await sb("GET", "/v1/organizations"), "조직 목록");
      const org = env.SUPABASE_ORG_ID || orgs[0]?.id || fail("Supabase 조직이 없다 — supabase.com 에서 조직을 하나 만드세요");
      if (!env.SUPABASE_DB_PASSWORD) save("SUPABASE_DB_PASSWORD", rand(16));
      const created = must(await sb("POST", "/v1/projects", { name, organization_id: org, db_pass: env.SUPABASE_DB_PASSWORD, region: "ap-northeast-2" }), "프로젝트 생성");
      ref = created.id;
      console.log(`  새 프로젝트 ${name} (${ref}) — 준비될 때까지 기다린다`);
    }
    save("SUPABASE_PROJECT_REF", ref);
  }
  for (let i = 0; ; i++) {
    const p = must(await sb("GET", `/v1/projects/${ref}`), "프로젝트 상태");
    if (p.status === "ACTIVE_HEALTHY") break;
    if (i > 60) fail(`프로젝트가 10분 넘게 준비 중(${p.status}) — 잠시 뒤 다시 실행`);
    await sleep(10_000);
  }
  const sql = async (query, what) => must(await sb("POST", `/v1/projects/${ref}/database/query`, { query }), what);

  step("마이그레이션");
  await sql("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);", "이력 테이블");
  const done = new Set((await sql("select version from supabase_migrations.schema_migrations", "이력 조회")).map((r) => r.version));
  const files = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const version = f.split("_")[0];
    if (done.has(version)) continue;
    await sql(fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"), `마이그레이션 ${f}`);
    await sql(`insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${f.slice(version.length + 1, -4)}')`, `이력 ${f}`);
    console.log(`  ✓ ${f}`);
  }

  step("시드 (스테이징 전용)");
  const [{ n }] = await sql("select count(*)::int as n from brands", "시드 확인");
  if (n === 0) {
    await sql(fs.readFileSync(path.join(root, "supabase/seed.sql"), "utf8"), "시드");
    if (!env.E2E_PASSWORD) save("E2E_PASSWORD", rand(12));
    // 시드 계정의 공개 비밀번호(password123)를 무작위 값으로 — 스테이징 주소는 외부에서 열린다
    await sql(`update auth.users set encrypted_password = crypt('${env.E2E_PASSWORD}', gen_salt('bf'))`, "시드 비밀번호 교체");
    console.log("  ✓ 시드 + 비밀번호 교체 (E2E_PASSWORD, .env.staging)");
  } else console.log("  이미 있음 — 건너뜀");

  step("API 키");
  const keys = must(await sb("GET", `/v1/projects/${ref}/api-keys?reveal=true`), "API 키");
  const key = (n) => keys.find((k) => k.name === n)?.api_key || fail(`${n} 키를 못 찾았다`);
  const url = `https://${ref}.supabase.co`;
  const service = key("service_role");

  step("Storage 버킷 (전부 비공개, 50MiB)");
  for (const id of BUCKETS) {
    const r = await api(`${url}/storage/v1`, service, "POST", "/bucket", { id, name: id, public: false, file_size_limit: MiB50 });
    console.log(`  ${r.ok ? "✓" : r.status === 400 || r.status === 409 ? "·" : "✗"} ${id}${r.ok ? "" : r.status === 400 || r.status === 409 ? " (이미 있음)" : ` ${JSON.stringify(r.data)}`}`);
  }
  return { ref, url, anon: key("anon"), service, sql };
}

async function supabaseAuth(ref, appUrl) {
  step("Supabase Auth 설정 (초대 전용·OTP 6자리 10분·카카오)");
  const kakao = env.KAKAO_CLIENT_ID && env.KAKAO_CLIENT_SECRET;
  must(await sb("PATCH", `/v1/projects/${ref}/config/auth`, {
    site_url: appUrl,
    uri_allow_list: `${appUrl}/**,http://localhost:3000/**`,
    disable_signup: true,
    external_email_enabled: true,
    mailer_otp_length: 6,
    mailer_otp_exp: 600,
    jwt_exp: 3600,
    ...(kakao && { external_kakao_enabled: true, external_kakao_client_id: env.KAKAO_CLIENT_ID, external_kakao_secret: env.KAKAO_CLIENT_SECRET }),
  }), "Auth 설정");
  if (!kakao) console.log("  카카오 키가 없어 카카오 로그인은 꺼 둠 — 키를 넣고 다시 실행하면 켜진다");
}

// ---------- Vercel ----------
async function vercelProject() {
  step("Vercel 프로젝트");
  let p = await vc("GET", `/v9/projects/${name}`);
  if (p.status === 404) p = await vc("POST", "/v11/projects", { name, framework: "nextjs" });
  const proj = must(p, "Vercel 프로젝트");
  fs.mkdirSync(path.join(root, ".vercel"), { recursive: true });
  fs.writeFileSync(path.join(root, ".vercel/project.json"), JSON.stringify({ projectId: proj.id, orgId: env.VERCEL_TEAM_ID || proj.accountId }));
  return proj;
}
async function appDomain(projId) {
  const d = await vc("GET", `/v9/projects/${projId}/domains`);
  return d.ok && d.data.domains?.length ? `https://${d.data.domains[0].name}` : `https://${name}.vercel.app`;
}
async function setEnv(projId, vars) {
  step("Vercel 환경변수");
  for (const [key, value] of Object.entries(vars)) {
    if (!value) { console.log(`  · ${key} (비어 있음 — 건너뜀)`); continue; }
    must(await vc("POST", `/v10/projects/${projId}/env?upsert=true`, { key, value, type: key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted", target: ["production", "preview"] }), `환경변수 ${key}`);
    console.log(`  ✓ ${key}`);
  }
}
function deploy() {
  step("배포 (Vercel 원격 빌드, 몇 분 걸린다)");
  const r = spawnSync("npx", ["-y", "vercel@latest", "deploy", "--prod", "--yes", "--token", env.VERCEL_TOKEN, ...(env.VERCEL_TEAM_ID ? ["--scope", env.VERCEL_TEAM_ID] : [])], { cwd: root, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (r.status !== 0) fail("배포 실패 — 위 로그 확인. 크론 오류면 Vercel Pro 플랜이 필요하다(vercel.json 크론 */5)");
  return r.stdout.trim().split(/\s+/).pop();
}

async function health(appUrl) {
  step("헬스 체크");
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${appUrl}/api/health`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }).catch(() => null);
    if (r && (r.ok || r.status === 503)) { const j = await r.json(); console.log(`  ${JSON.stringify(j)}`); return j; } // 503 = 앱은 떴고 DB·환경변수 문제
    await sleep(5_000);
  }
  fail(`${appUrl}/api/health 가 응답하지 않는다`);
}

// ---------- 실행 ----------
if (process.argv.includes("--e2e")) {
  const base = need("STAGING_URL");
  spawnSync("npx", ["playwright", "install", "chromium"], { cwd: root, shell: true, stdio: "inherit" });
  const r = spawnSync("pnpm", ["e2e"], { cwd: root, shell: true, stdio: "inherit", env: { ...process.env, E2E_BASE_URL: base, E2E_PASSWORD: need("E2E_PASSWORD") } });
  process.exit(r.status ?? 1);
}

if (!env.CRON_SECRET) save("CRON_SECRET", rand(32));
const s = await supabase();
const proj = await vercelProject();
let appUrl = await appDomain(proj.id);
const vars = {
  NEXT_PUBLIC_SUPABASE_URL: s.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: s.anon, SUPABASE_SERVICE_ROLE_KEY: s.service, NEXT_PUBLIC_APP_URL: appUrl, CRON_SECRET: env.CRON_SECRET,
  RESEND_API_KEY: env.RESEND_API_KEY, MAIL_FROM: env.MAIL_FROM, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, WECOM_WEBHOOK_URL: env.WECOM_WEBHOOK_URL,
  KAKAO_CLIENT_ID: env.KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET: env.KAKAO_CLIENT_SECRET, TRANSLATE_MODEL: env.TRANSLATE_MODEL,
};
await setEnv(proj.id, vars);
await supabaseAuth(s.ref, appUrl);
deploy();
const actual = await appDomain(proj.id);
if (actual !== appUrl) { // 첫 배포 뒤에야 도메인이 정해진 경우 — 주소를 고쳐 한 번 더
  appUrl = actual;
  await setEnv(proj.id, { NEXT_PUBLIC_APP_URL: appUrl });
  await supabaseAuth(s.ref, appUrl);
  deploy();
}
if (env.STAGING_URL !== appUrl) save("STAGING_URL", appUrl);
const h = await health(appUrl);

step("사전 점검 (시드가 있어 '시드 흔적'은 정상)");
const pre = await sb("POST", `/v1/projects/${s.ref}/database/query`, { query: fs.readFileSync(path.join(root, "supabase/checks/prod_preflight.sql"), "utf8") });
console.log(`  ${pre.ok ? "PREFLIGHT OK" : typeof pre.data === "string" ? pre.data : JSON.stringify(pre.data)}`);

console.log(`\n✔ 스테이징 준비 완료: ${appUrl}`);
console.log(`  시드 계정 비밀번호 = .env.staging 의 E2E_PASSWORD (계정 목록: supabase/seed.sql)`);
console.log(`  ${h.issues?.length ? `환경변수 경고 ${h.issues.length}건 — 비어 있는 키를 .env.staging 에 넣고 다시 실행` : "환경변수 경고 없음"}`);
console.log(`  E2E: node scripts/setup-staging.mjs --e2e`);
