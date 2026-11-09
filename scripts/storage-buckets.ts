/**
 * 클라우드 Storage 버킷 설정을 supabase/config.toml에 맞춘다 (비공개 · 용량 상한 · 받는 형식).
 * 로컬은 `supabase start`가 config.toml로 만들지만, 클라우드(개발·운영)는 따로 맞춰야 한다 — 11-09에
 * 사진을 JPEG로 바꿨는데 클라우드 버킷이 webp만 받아 모든 사진 업로드가 막혔다.
 *
 *   node --no-warnings --env-file=.env.local scripts/storage-buckets.ts           # 미리 보기(기본): 다른 점만
 *   node --no-warnings --env-file=.env.local scripts/storage-buckets.ts --apply   # 맞추기
 *
 * 버킷을 새로 만들거나 지우지 않는다(없는 버킷은 알려만 준다). 비밀값(키·URL)은 출력하지 않는다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Cfg = typeof import("../lib/storage-buckets-config");
const { parseBucketConfig } = (await import(new URL("../lib/storage-buckets-config.ts", import.meta.url).href)) as Cfg;

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY가 없다 (--env-file=.env.local)");
  process.exit(1);
}

const want = parseBucketConfig(readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8"));
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: have, error } = await db.storage.listBuckets();
if (error) {
  console.error(`✗ 버킷 목록을 못 읽었다: ${error.message}`);
  process.exit(1);
}

const same = (a: string[] | null | undefined, b: string[] | null) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
let diffs = 0;
for (const w of want) {
  const h = have.find((b) => b.id === w.id);
  if (!h) {
    console.log(`! ${w.id}: 클라우드에 없다 — Dashboard에서 만든 뒤 다시 돌린다`);
    continue;
  }
  const changes: string[] = [];
  if (h.public !== w.public) changes.push(`public ${h.public} → ${w.public}`);
  if ((h.file_size_limit ?? null) !== w.fileSizeLimit) changes.push(`file_size_limit ${h.file_size_limit ?? "없음"} → ${w.fileSizeLimit ?? "없음"}`);
  if (!same(h.allowed_mime_types, w.allowedMimeTypes)) changes.push(`allowed_mime_types ${JSON.stringify(h.allowed_mime_types ?? null)} → ${JSON.stringify(w.allowedMimeTypes)}`);
  if (!changes.length) {
    console.log(`= ${w.id}: 같다`);
    continue;
  }
  diffs++;
  console.log(`~ ${w.id}: ${changes.join(" · ")}`);
  if (apply) {
    const { error: e } = await db.storage.updateBucket(w.id, {
      public: w.public,
      fileSizeLimit: w.fileSizeLimit ?? undefined,
      allowedMimeTypes: w.allowedMimeTypes ?? undefined,
    });
    console.log(e ? `  ✗ 실패: ${e.message}` : "  ✓ 맞췄다");
  }
}
console.log(diffs === 0 ? "다른 점 없음" : apply ? "끝" : `다른 점 ${diffs}개 — --apply로 맞춘다`);
