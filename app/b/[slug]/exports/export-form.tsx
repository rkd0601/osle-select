"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { Photo } from "@/components/domain/photo";
import { createExportPackage } from "./actions";

type Cand = { productId: string; code: string; name: string; order: boolean; sample: boolean; photoCount: number; cover: string | null };
const PRESETS = ["cafe24", "godo", "imweb", "smartstore"] as const;
const SOURCES = ["all", "order", "sample"] as const;

/** B-12 패키지 만들기. 출처 칩(전체·발주 확정·샘플 채택)은 화면 안 거르기 — 선택은 유지된다. */
export function ExportForm({ brandId, candidates }: { brandId: string; candidates: Cand[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [presets, setPresets] = useState<(typeof PRESETS)[number][]>([]);
  const [src, setSrc] = useState<(typeof SOURCES)[number]>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!candidates.length) return <p className="rounded-ui border border-dashed border-line-strong px-4 py-8 text-center text-body text-ink-2">{tk("export.empty")}</p>;
  const shown = candidates.filter((c) => src === "all" || c[src]);
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.includes(c.productId));
  const count = (k: (typeof SOURCES)[number]) => candidates.filter((c) => k === "all" || c[k]).length;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={tk("export.filter")}>
          {SOURCES.map((k) => (
            <button key={k} type="button" className="chip" data-active={src === k ? "true" : undefined} aria-pressed={src === k} onClick={() => setSrc(k)}>
              {tk(`export.filter.${k}`)}<span className="count">{count(k)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => setPicked(allShownPicked ? picked.filter((id) => !shown.some((c) => c.productId === id)) : [...new Set([...picked, ...shown.map((c) => c.productId)])])}>
          {tk(allShownPicked ? "export.unselectAll" : "export.selectAll")}
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((c) => {
          const on = picked.includes(c.productId);
          return (
            <li key={c.productId}>
              <label className={`card flex cursor-pointer gap-3 p-3 transition-colors ${on ? "border-ink" : "hover:border-line-strong"}`}>
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.productId] : picked.filter((x) => x !== c.productId))} />
                <span className="w-16 shrink-0"><Photo src={c.cover} /></span>
                <span className="min-w-0 text-body">
                  <span className="num block text-caption text-muted">{c.code}</span>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {c.order && <span className="rounded-full bg-signature-soft px-2 py-0.5 text-micro font-semibold text-signature">{tk("export.src.order")}</span>}
                    {c.sample && <span className="rounded-full bg-sand px-2 py-0.5 text-micro font-semibold text-ink-2">{tk("export.src.sample")}</span>}
                  </span>
                  <span className={`num mt-1 block text-caption ${c.photoCount ? "text-muted" : "text-warn"}`}>{c.photoCount ? tk("export.photos", { n: c.photoCount }) : tk("export.noPhotos")}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="card card-pad text-body">
        <p className="font-semibold">{tk("export.standard")}</p>
        <p className="mt-1 text-meta text-ink-2">{tk("export.standardHelp")}</p>
        <fieldset className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3">
          <legend className="sr-only">{tk("export.presets")}</legend>
          <p className="w-full text-meta text-ink-2" aria-hidden>{tk("export.presets")}</p>
          {PRESETS.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={presets.includes(s)} onChange={(e) => setPresets(e.target.checked ? [...presets, s] : presets.filter((x) => x !== s))} />
              {tk(`export.shop.${s}`)} <span className="text-caption text-muted">{tk("export.draft")}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button className="btn btn-primary btn-lg" disabled={pending || !picked.length || picked.length > 30}
          onClick={() => start(async () => {
            setMsg(null); setNote(null);
            const r = await createExportPackage(brandId, { productIds: picked, presets });
            if (!r.ok) return setMsg(tk(r.error));
            setPicked([]);
            if (r.data.missingPhotos > 0) setNote(tk("export.missingPhotos", { n: r.data.missingPhotos }));
            router.refresh();
          })}>{pending ? tk("export.building") : tk("export.create", { n: picked.length })}</button>
        {msg && <span className="text-meta text-crit">{msg}</span>}
        {note && <span className="text-meta text-warn">{note}</span>}
      </div>
    </section>
  );
}
