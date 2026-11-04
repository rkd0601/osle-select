"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { ImagePicker, type PickedImage } from "@/components/domain/image-picker";
import { cancelRequestItem, supplyRequestInfo } from "../actions";

/**
 * B-03 항목 행위: 보완 응답(needs_info). 버튼 노출은 서버가 계산한 allowed로만 (전이는 서버에서 다시 검증).
 * 디자인 v2: 보완 입력은 행동이 있는 블록이라 입력 상자 하나(surface + 1px line), 입력은 밑줄.
 * 취소는 항목 행 오른쪽 끝의 CancelItemButton(3차 검증 T3).
 */
export function ItemActions({ brandId, itemId, canSupply }: { brandId: string; itemId: string; canSupply: boolean }) {
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
  if (!canSupply) return null;

  return (
    <div className="space-y-3">
      {canSupply && (
        <div className="space-y-5 border border-line bg-surface p-5">
          <textarea aria-label={tk("request.detail.supply.ph")}
            className="field"
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
            className="btn max-sm:w-full"
          >
            {tk("request.detail.supply")}
          </button>
        </div>
      )}
      {error && <p className="text-meta text-crit">{error}</p>}
    </div>
  );
}

/** 항목 행 오른쪽 끝 "취소"(13px muted, 3차 검증 T3) — 확인 후 cancelled 전이(서버가 다시 검증) */
export function CancelItemButton({ brandId, itemId }: { brandId: string; itemId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        className="cancel"
        disabled={pending}
        aria-label={tk("request.detail.cancel")}
        onClick={() => {
          if (!window.confirm(tk("request.detail.cancelConfirm"))) return;
          start(async () => {
            setError(null);
            const res = await cancelRequestItem(brandId, itemId);
            if (!res.ok) return setError(tk(res.error));
            router.refresh();
          });
        }}
      >
        {tk("request.detail.cancelShort")}
      </button>
      {error && <span className="mt-1 text-caption text-crit">{error}</span>}
    </span>
  );
}
