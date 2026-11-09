/**
 * supabase/config.toml의 [storage.buckets.*] 읽기 — 로컬 설정이 기준이고, 운영·개발 클라우드 버킷은
 * scripts/storage-buckets.ts가 이 값으로 맞춘다. 단위 테스트가 "사진 형식(PHOTO_TYPE)을 버킷이 받는지"를 검사한다
 * (11-09: 클라이언트를 JPEG로 바꿨는데 버킷이 webp만 받아 모든 사진 업로드가 415로 막혔다).
 */
export type BucketConfig = { id: string; public: boolean; fileSizeLimit: number | null; allowedMimeTypes: string[] | null };

const UNITS: Record<string, number> = { B: 1, KB: 1000, KIB: 1024, MB: 1000 ** 2, MIB: 1024 ** 2, GB: 1000 ** 3, GIB: 1024 ** 3 };

export function parseSize(v: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(v);
  if (!m) return null;
  const unit = UNITS[(m[2] || "B").toUpperCase()];
  return unit ? Math.round(Number(m[1]) * unit) : null;
}

export function parseBucketConfig(toml: string): BucketConfig[] {
  const out: BucketConfig[] = [];
  let cur: BucketConfig | null = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) {
      const b = /^storage\.buckets\.([\w-]+)$/.exec(sec[1]);
      cur = b ? { id: b[1], public: false, fileSizeLimit: null, allowedMimeTypes: null } : null;
      if (cur) out.push(cur);
      continue;
    }
    if (!cur) continue;
    const kv = /^([\w_]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const [, k, v] = kv;
    if (k === "public") cur.public = v === "true";
    else if (k === "file_size_limit") cur.fileSizeLimit = parseSize(v.replace(/"/g, ""));
    else if (k === "allowed_mime_types") cur.allowedMimeTypes = [...v.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return out;
}
