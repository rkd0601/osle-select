import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS, SIGNED_URL_TTL } from "@/lib/config";

/**
 * 비공개 버킷 서명 URL (PRD 6장). 호출부가 역할·소유를 먼저 검증한 뒤에만 부른다.
 * Storage 정책 없이 서비스 롤로 발급하므로, 경로 검증(isOwnRequestImagePath 등)이 접근 제어의 핵심이다.
 */
export async function signedUploadUrl(bucket: keyof typeof BUCKETS, path: string) {
  const { data, error } = await createAdminClient().storage.from(BUCKETS[bucket]).createSignedUploadUrl(path);
  if (error || !data) return null;
  return { path: data.path, token: data.token };
}

/** 서버 프록시 업로드 (서명 URL 직접 업로드 실패 시 폴백) */
export async function proxyUpload(bucket: keyof typeof BUCKETS, path: string, body: Blob) {
  const { error } = await createAdminClient().storage.from(BUCKETS[bucket]).upload(path, body, { contentType: "image/webp", upsert: false });
  return !error;
}

/** path → 서명 읽기 URL 맵 */
export async function signedReadUrls(bucket: keyof typeof BUCKETS, paths: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(paths.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await createAdminClient().storage.from(BUCKETS[bucket]).createSignedUrls(uniq, SIGNED_URL_TTL);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
}
