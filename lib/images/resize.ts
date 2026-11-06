/**
 * 클라이언트 사진 축소 (NEXT §0-l P3·A3): 긴 변 1600px **JPEG 0.85**. 브라우저 전용.
 * WebP를 버린 이유: iOS Safari는 canvas WebP 인코딩을 못 해 PNG(수 MB)를 돌려주고, 서버는 그걸 거부했다(조용한 실패 경로).
 * HEIC 등 브라우저가 못 여는 사진은 `upload.decode`로 던진다 — 호출부가 그대로 화면에 보여 준다.
 */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;
export const PHOTO_TYPE = "image/jpeg";
export const PHOTO_EXT = "jpg";

export function fitWithin(w: number, h: number, max = MAX_EDGE): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const r = Math.min(max / w, max / h);
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

/** createImageBitmap → 안 되면 <img> 디코드(구형 Safari). 둘 다 실패하면 upload.decode */
async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("upload.decode");
    }
  }
}

export async function shrinkPhoto(file: Blob, maxEdge = MAX_EDGE): Promise<Blob> {
  const img = await decode(file);
  const { w, h } = fitWithin(img.w, img.h, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // 투명 PNG → JPEG 검은 배경 방지
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img.src, 0, 0, w, h);
  img.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b && b.type === PHOTO_TYPE ? resolve(b) : reject(new Error("upload.encode"))), PHOTO_TYPE, JPEG_QUALITY),
  );
}

/** 던진 오류 → i18n 키 (upload.decode·upload.encode, 그 밖은 upload.failed) */
export const photoErrorKey = (e: unknown) => (e instanceof Error && /^upload\.[a-z]+$/.test(e.message) ? e.message : "upload.failed");

/** 서버 프록시가 받는 형식 (예전 WebP 클라이언트도 허용) */
export const isAcceptedPhotoType = (t: string) => t === PHOTO_TYPE || t === "image/webp";
