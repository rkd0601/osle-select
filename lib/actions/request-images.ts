"use server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireBrandAccess } from "@/lib/auth/guards";
import { proxyUpload, signedUploadUrl } from "@/lib/storage";
import { requestImagePath } from "@/lib/requests";

/** 요청 이미지 업로드 (B-02·B-03 보완·A-02 대행 공통). 브랜드 멤버 또는 ADMIN만. */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Id = z.guid();

/** B-02 이미지 업로드 1단계: 서명 업로드 URL 발급 (브랜드 prefix 경로만) */
export async function issueRequestImageUploads(brandId: string, count: number): Promise<Result<{ path: string; token: string }[]>> {
  if (!Id.safeParse(brandId).success || !Number.isInteger(count) || count < 1 || count > 10) return { ok: false, error: "common.invalid" };
  if (!(await requireBrandAccess(brandId))) return { ok: false, error: "common.notFound" };
  const out: { path: string; token: string }[] = [];
  for (let i = 0; i < count; i++) {
    const s = await signedUploadUrl("requestImages", requestImagePath(brandId, randomUUID()));
    if (!s) return { ok: false, error: "upload.failed" };
    out.push(s);
  }
  return { ok: true, data: out };
}

/** 서명 URL 업로드 실패 시 서버 프록시 업로드 (클라이언트에서 이미 WebP로 줄인 파일) */
export async function proxyRequestImageUpload(form: FormData): Promise<Result<{ path: string }>> {
  const brandId = String(form.get("brandId") ?? "");
  const file = form.get("file");
  if (!Id.safeParse(brandId).success || !(file instanceof Blob) || file.size > 5 * 1024 * 1024 || file.type !== "image/webp") return { ok: false, error: "common.invalid" };
  if (!(await requireBrandAccess(brandId))) return { ok: false, error: "common.notFound" };
  const path = requestImagePath(brandId, randomUUID());
  return (await proxyUpload("requestImages", path, file)) ? { ok: true, data: { path } } : { ok: false, error: "upload.failed" };
}
