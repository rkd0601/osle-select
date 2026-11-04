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
 * 디자인 v2: 3:4 `.photo` 자리(radius 0, 테두리 없음), 추가 칸은 점선 1px.
 */
export function ImagePicker({ brandId, value, onChange, max = 10, layout = "grid", addLabel, addHint }: {
  brandId: string; value: PickedImage[]; onChange: (v: PickedImage[]) => void; max?: number;
  /** stack = 디자인 v2 B-02: 3:4 자리(.dropzone) 하나 + 아래 작은 썸네일 3칸 */
  layout?: "grid" | "stack"; addLabel?: string; addHint?: string;
}) {
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

  const remove = (path: string) => onChange(value.filter((v) => v.path !== path));
  const thumb = (img: PickedImage) => (
    <div key={img.path} className="group relative aspect-[3/4] overflow-hidden bg-well">
      {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 미리보기(blob URL) */}
      <img src={img.preview} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={() => remove(img.path)} className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center bg-ink/75 text-body text-paper hover:bg-ink" aria-label={tk("common.cancel")}>×</button>
    </div>
  );
  if (layout === "stack") {
    const [first, ...rest] = value;
    return (
      <div>
        {first ? thumb(first) : (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="dropzone w-full transition-colors hover:border-ink hover:text-ink disabled:opacity-60">
            <span>{busy ? tk("upload.uploading") : (addLabel ?? tk("upload.add"))}{!busy && addHint && <><br /><span className="text-caption">{addHint}</span></>}</span>
          </button>
        )}
        {(rest.length > 0 || (first && value.length < max)) && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {rest.map(thumb)}
            {first && value.length < max && (
              <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label={tk("upload.add")}
                className="flex aspect-[3/4] items-center justify-center border border-dashed border-line-strong text-meta text-ink-2 hover:border-ink hover:text-ink disabled:opacity-60">
                {busy ? "…" : "+"}
              </button>
            )}
          </div>
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        {error && <p role="alert" className="mt-1.5 text-meta text-crit">{error}</p>}
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {value.map((img) => (
          <div key={img.path} className="photo group">
            {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 미리보기(blob URL) */}
            <img src={img.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((v) => v.path !== img.path))} className="absolute right-0 top-0 inline-flex h-10 w-10 items-start justify-end p-1" aria-label={tk("common.cancel")}><span aria-hidden className="inline-flex h-7 w-7 items-center justify-center bg-ink/75 text-body text-paper group-hover:bg-ink">×</span></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex aspect-[3/4] flex-col items-center justify-center gap-1 border border-dashed border-line-strong text-meta text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:opacity-60">
            {!busy && <span aria-hidden className="num text-h4 font-light leading-none">+</span>}
            {busy ? tk("upload.uploading") : tk("upload.add")}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {error && <p role="alert" className="mt-1.5 text-meta text-crit">{error}</p>}
    </div>
  );
}
