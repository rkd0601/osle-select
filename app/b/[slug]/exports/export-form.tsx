"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { createExportPackage } from "./actions";

type Cand = { productId: string; code: string; name: string; order: boolean; sample: boolean; photoCount: number; cover: string | null };
const PRESETS = ["cafe24", "godo", "imweb", "smartstore"] as const;

export function ExportForm({ brandId, candidates }: { brandId: string; candidates: Cand[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [presets, setPresets] = useState<(typeof PRESETS)[number][]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!candidates.length) return <p className="bg-surface px-4 py-3 text-[13px] text-ink-2">{tk("export.empty")}</p>;
  return (
    <section className="space-y-4">
      <ul className="grid gap-px bg-line sm:grid-cols-2">
        {candidates.map((c) => {
          const on = picked.includes(c.productId);
          return (
            <li key={c.productId} className="bg-paper">
              <label className={`flex cursor-pointer gap-3 p-3 ${on ? "bg-surface" : ""}`}>
                <input type="checkbox" className="mt-1 h-5 w-5" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.productId] : picked.filter((x) => x !== c.productId))} />
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                  <img src={c.cover} alt="" className="aspect-[3/4] w-16 bg-sand object-cover" />
                ) : <span className="aspect-[3/4] w-16 bg-sand" />}
                <span className="text-[13px]">
                  <span className="num block text-[11px] text-muted">{c.code}</span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="mt-1 block text-[11px] text-ink-2">{[c.order ? tk("export.src.order") : null, c.sample ? tk("export.src.sample") : null].filter(Boolean).join(" · ")}</span>
                  <span className={`num block text-[11px] ${c.photoCount ? "text-muted" : "text-warn"}`}>{c.photoCount ? tk("export.photos", { n: c.photoCount }) : tk("export.noPhotos")}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="border-y border-line py-3 text-[13px]">
        <p className="font-medium">{tk("export.standard")}</p>
        <p className="mt-1 text-[12px] text-ink-2">{tk("export.standardHelp")}</p>
        <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-[12px] text-muted">{tk("export.presets")}</legend>
          {PRESETS.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4" checked={presets.includes(s)} onChange={(e) => setPresets(e.target.checked ? [...presets, s] : presets.filter((x) => x !== s))} />
              {tk(`export.shop.${s}`)} <span className="text-[11px] text-muted">{tk("export.draft")}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40" disabled={pending || !picked.length || picked.length > 30}
          onClick={() => start(async () => {
            setMsg(null);
            const r = await createExportPackage(brandId, { productIds: picked, presets });
            if (!r.ok) return setMsg(tk(r.error));
            setPicked([]);
            router.refresh();
          })}>{pending ? tk("export.building") : tk("export.create", { n: picked.length })}</button>
        {msg && <span className="text-[12px] text-crit">{msg}</span>}
      </div>
    </section>
  );
}
