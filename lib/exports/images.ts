import "server-only";
import sharp from "sharp";

/** 판매용 사진 → JPG (DECISIONS 9-6: 품질 90, 긴 변 2000px, EXIF 회전 반영). 업로드 원본(WebP)은 그대로 둔다. 실패하면 null */
export async function toSalesJpg(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const out = await sharp(bytes).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
