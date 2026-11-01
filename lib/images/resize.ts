/**
 * 클라이언트 리사이즈: 긴 변 2000px, WebP 0.85 (CLAUDE.md 코딩 규칙). 브라우저 전용.
 */
export const MAX_EDGE = 2000;
export const WEBP_QUALITY = 0.85;

export function fitWithin(w: number, h: number, max = MAX_EDGE): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const r = Math.min(max / w, max / h);
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

export async function resizeToWebp(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/webp", WEBP_QUALITY));
}
