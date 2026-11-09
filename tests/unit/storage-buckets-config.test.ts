import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBucketConfig, parseSize } from "@/lib/storage-buckets-config";
import { PHOTO_TYPE } from "@/lib/images/resize";
import { LINK_IMAGE_TYPES } from "@/lib/link-meta";
import { BUCKETS } from "@/lib/config";

const buckets = parseBucketConfig(readFileSync("supabase/config.toml", "utf8"));
const byId = (id: string) => buckets.find((b) => b.id === id);

describe("Storage 버킷 설정 (supabase/config.toml)", () => {
  it("크기 읽기", () => {
    expect(parseSize("5MiB")).toBe(5 * 1024 * 1024);
    expect(parseSize("50MiB")).toBe(50 * 1024 * 1024);
    expect(parseSize("12")).toBe(12);
  });
  it("모든 버킷은 비공개", () => {
    expect(buckets.length).toBeGreaterThan(0);
    for (const b of buckets) expect(b.public, b.id).toBe(false);
  });
  it("사진 버킷은 클라이언트가 올리는 형식(PHOTO_TYPE)과 예전 webp를 받는다 — 11-09 업로드 415 회귀 방지", () => {
    for (const id of [BUCKETS.requestImages, BUCKETS.productImages, BUCKETS.vendorCards, BUCKETS.samplePhotos, "inspection-photos"]) {
      const b = byId(id);
      expect(b, id).toBeTruthy();
      expect(b!.allowedMimeTypes, id).toContain(PHOTO_TYPE);
      expect(b!.allowedMimeTypes, id).toContain("image/webp");
    }
  });
  it("request-images는 링크 대표 사진 형식도 받는다", () => {
    for (const t of Object.keys(LINK_IMAGE_TYPES)) expect(byId(BUCKETS.requestImages)!.allowedMimeTypes).toContain(t);
  });
});
