"use client";
import { useRef, useState } from "react";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { resizeToWebp } from "@/lib/images/resize";
import { BUCKETS } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { issueRequestImageUploads, proxyRequestImageUpload } from "@/lib/actions/request-images";

export type PickedImage = { path: string; preview: string };

/**
 * 요청 이미지 선택·업로드. 리사이즈(2000px WebP) → 서명 URL 직접 업로드 → 실패 시 서버 프록시 업로드.
 * 업로드가 끝난 경로만 부모에게 넘긴다(경로는 서버에서 브랜드 prefix로 다시 검증).
 */
export function ImagePicker({ brandId, value, onChange, max = 10 }: { brandId: string; value: PickedImage[]; onChange: (v: PickedImage[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, max - value.length);
    if (!list.length) return;
    setBusy(true);
    setError(null);
    try {
      const blobs = await Promise.all(list.map(resizeToWebp));
      const issued = await issueRequestImageUploads(brandId, blobs.length);
      if (!issued.ok) throw new Error(issued.error);
      const done: PickedImage[] = [];
      for (let i = 0; i < blobs.length; i++) {
        const { path, token } = issued.data[i];
        const direct = await uploadToSignedUrl(BUCKETS.requestImages, path, token, blobs[i]);
        let finalPath = path;
        if (!direct) {
          const fd = new FormData();
          fd.set("brandId", brandId);
          fd.set("file", new File([blobs[i]], "image.webp", { type: "image/webp" }));
          const proxied = await proxyRequestImageUpload(fd);
          if (!proxied.ok) throw new Error(proxied.error);
          finalPath = proxied.data.path;
        }
        done.push({ path: finalPath, preview: URL.createObjectURL(blobs[i]) });
      }
      onChange([...value, ...done]);
    } catch {
      setError(tk("upload.failed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {value.map((img) => (
          <div key={img.path} className="group relative aspect-[3/4] overflow-hidden bg-sand">
            {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 미리보기(blob URL) */}
            <img src={img.preview} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((v) => v.path !== img.path))} className="absolute right-1 top-1 bg-ink/70 px-1.5 text-[11px] text-paper" aria-label={tk("common.cancel")}>×</button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex aspect-[3/4] items-center justify-center border border-dashed border-ink-2/40 text-[12px] text-ink-2 hover:border-ink">
            {busy ? tk("upload.uploading") : tk("upload.add")}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {error && <p className="mt-1 text-[12px] text-crit">{error}</p>}
    </div>
  );
}
