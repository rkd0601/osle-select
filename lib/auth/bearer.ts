import "server-only";
import { timingSafeEqual } from "node:crypto";

/** `Authorization: Bearer <secret>` 비교 — 길이·내용을 상수 시간으로 (크론·헬스 상세). secret이 비어 있으면 항상 거부 */
export function bearerOk(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
