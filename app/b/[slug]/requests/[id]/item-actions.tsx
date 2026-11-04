"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { ImagePicker, type PickedImage } from "@/components/domain/image-picker";
import { cancelRequestItem, supplyRequestInfo } from "../actions";

/** B-03 항목 행위: 보완 응답(needs_info) · 취소. 버튼 노출은 서버가 계산한 allowed로만 (전이는 서버에서 다시 검증). */
export function ItemActions({ brandId, itemId, canCancel, canSupply }: { brandId: string; itemId: string; canCancel: boolean; canSupply: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(tk(res.error));
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {canSupply && (
        <div className="space-y-3 rounded-ui border border-warn/30 bg-warn-soft/40 p-4">
          <textarea aria-label={tk("request.detail.supply.ph")}
            className="field min-h-24"
            placeholder={tk("request.detail.supply.ph")}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <ImagePicker brandId={brandId} value={images} onChange={setImages} max={10} />
          <input aria-label={tk("request.field.links.ph")}
            className="field"
            inputMode="url"
            placeholder={tk("request.field.links.ph")}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
          />
          <button
            disabled={pending || !note.trim()}
            onClick={() => run(() => supplyRequestInfo(brandId, itemId, { note, imagePaths: images.map((i) => i.path), links: links.split(/\s+/).filter(Boolean) }))}
            className="btn btn-primary"
          >
            {tk("request.detail.supply")}
          </button>
        </div>
      )}
      {canCancel && (
        <button
          disabled={pending}
          onClick={() => {
            if (window.confirm(tk("request.detail.cancelConfirm"))) run(() => cancelRequestItem(brandId, itemId));
          }}
          className="text-meta text-muted underline-offset-4 hover:text-crit hover:underline"
        >
          {tk("request.detail.cancel")}
        </button>
      )}
      {error && <p className="text-meta text-crit">{error}</p>}
    </div>
  );
}
