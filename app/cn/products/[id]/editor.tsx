"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { resizeToWebp } from "@/lib/images/resize";
import { BUCKETS } from "@/lib/config";
import { t, tFor, type Locale } from "@/lib/i18n/cn";
import { CARE, CATEGORY_ZH, MOD_ITEMS, IMAGE_KINDS, IMAGE_SOURCES, MATERIALS, MEASUREMENTS, MEASUREMENT_TEMPLATE, ORIGINS, SUPPLY_TYPES, label as codeLabel } from "@/lib/codes";
import { LabelRows, ModRows, type LabelRow, type ModRow } from "@/components/domain/option-rows";
import { BLOCK_IDS } from "./block-ids";
import { stableJson } from "@/lib/json"; // lib/products는 zod를 끌고 온다 — 클라이언트 번들 예산
import {
  addProductImages, deleteProductImage, issueProductImageUploads, proxyCnImageUpload, requestReview, saveColors, saveSizes, updateProduct, updateProductImages,
} from "../actions";

/**
 * C-03 상품 상세 입력 (PC). 블록마다 저장 → 서버가 공개 조건을 다시 계산해 router.refresh()로 체크리스트 갱신.
 * locked(검수 대기 등)면 입력 전체 비활성. 원가·옵션 단가(CNY)는 CN·ADMIN 화면에만 존재한다.
 */
type R = { ok: true } | { ok: false; error: string };
const input = "field disabled:bg-paper disabled:text-ink-2";
const btn = "btn btn-primary min-h-10";
const btnSecondary = "btn btn-secondary min-h-10";
const addLink = "inline-flex min-h-10 items-center text-meta font-semibold text-signature hover:underline";
const rm = "inline-flex min-h-10 min-w-10 items-center justify-center rounded-ui text-lead text-ink-2 hover:bg-sand hover:text-crit";
const lbl = "flex flex-col gap-1 text-caption font-medium text-ink-2";
const savedMsg = "text-meta text-ink-2";


function useSave(L: Locale) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<R | { ok: true; data: unknown }>, onOk?: (r: unknown) => void) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) return setMsg(t(L, res.error));
      setMsg(t(L, "common.saved"));
      onOk?.(res);
      router.refresh();
    });
  return { pending, msg, run };
}

function Block({ id, title, children, foot }: { id: string; title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-28 overflow-hidden">
      <h2 className="border-b border-line px-4 py-3 text-h5 font-semibold md:px-6">{title}</h2>
      <div className="space-y-4 px-4 py-4 md:px-6 md:py-5">{children}</div>
      {foot && <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper/60 px-4 py-3 md:px-6">{foot}</div>}
    </section>
  );
}

// ---------------- 기본 정보 ----------------
export function BasicBlock({ L, productId, locked, categories, vendors, p }: {
  L: Locale; productId: string; locked: boolean; categories: string[]; vendors: { id: string; name: string; booth: string | null }[];
  p: { category: string | null; name_zh: string | null; desc_zh: string | null; quality_note_zh: string | null; verified_in_person: boolean; verified_place: string | null; vendor_id: string | null };
}) {
  const [f, setF] = useState({ category: p.category ?? "", nameZh: p.name_zh ?? "", descZh: p.desc_zh ?? "", qualityNoteZh: p.quality_note_zh ?? "", verified: p.verified_in_person, place: p.verified_place ?? "", vendorId: p.vendor_id ?? "" });
  const s = useSave(L);
  return (
    <Block id={BLOCK_IDS.basic} title={t(L, "product.detail.basic")} foot={<><button className={btn} disabled={locked || s.pending} onClick={() => s.run(() => updateProduct(productId, {
      category: f.category || null, nameZh: f.nameZh || null, descZh: f.descZh || null, qualityNoteZh: f.qualityNoteZh || null,
      ...(f.verified !== p.verified_in_person && { verifiedInPerson: f.verified }), verifiedPlace: f.place || null, ...(f.vendorId && f.vendorId !== p.vendor_id && { vendorId: f.vendorId }),
    }))}>{t(L, "common.save")}</button>{s.msg && <span className={savedMsg}>{s.msg}</span>}</>}>
      <fieldset disabled={locked} className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className={lbl}>{t(L, "product.detail.category")}
          <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">-</option>
            {categories.map((c) => <option key={c} value={c}>{L === "ko" ? c : (CATEGORY_ZH[c] ?? c)}</option>)}
          </select>
        </label>
        <label className={lbl}>{t(L, "product.vendor")}
          <select className={input} value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.booth ? ` · ${v.booth}` : ""}</option>)}
          </select>
        </label>
        <label className={`${lbl} md:col-span-2`}>{t(L, "product.name")}
          <input className={input} value={f.nameZh} maxLength={100} onChange={(e) => setF({ ...f, nameZh: e.target.value })} />
        </label>
        <label className={`${lbl} md:col-span-2`}>{t(L, "product.detail.desc")}
          <textarea className={`${input} min-h-16`} value={f.descZh} maxLength={2000} onChange={(e) => setF({ ...f, descZh: e.target.value })} />
        </label>
        <label className={`${lbl} md:col-span-2`}>{t(L, "product.detail.qualityNote")}
          <textarea className={`${input} min-h-12`} value={f.qualityNoteZh} maxLength={1000} onChange={(e) => setF({ ...f, qualityNoteZh: e.target.value })} />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-body"><input type="checkbox" className="h-5 w-5 accent-signature" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />{t(L, "product.detail.verified")}</label>
        <label className={lbl}>{t(L, "product.detail.verifiedPlace")}
          <input className={input} value={f.place} maxLength={60} onChange={(e) => setF({ ...f, place: e.target.value })} />
        </label>
      </fieldset>
    </Block>
  );
}

// ---------------- 사진 ----------------
type Img = { id: string; storage_path: string; kind: string; source: string; usable_for_sales: boolean; sort_order: number; color_id: string | null };
export function PhotosBlock({ L, productId, locked, images, urls, colors }: { L: Locale; productId: string; locked: boolean; images: Img[]; urls: Record<string, string>; colors: { id: string; name_zh: string | null }[] }) {
  const [rows, setRows] = useState(images.map((i) => ({ ...i })));
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useSave(L);
  const move = (i: number, d: -1 | 1) => setRows((r) => { const x = [...r]; const j = i + d; if (j < 0 || j >= x.length) return r; [x[i], x[j]] = [x[j], x[i]]; return x; });
  const set = (i: number, p: Partial<Img>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const blobs = await Promise.all([...files].slice(0, 15).map(resizeToWebp));
    s.run(async () => {
      const issued = await issueProductImageUploads(productId, blobs.length);
      if (!issued.ok) return issued;
      const paths: string[] = [];
      for (let i = 0; i < blobs.length; i++) {
        const { path, token } = issued.data[i];
        if (await uploadToSignedUrl(BUCKETS.productImages, path, token, blobs[i])) { paths.push(path); continue; }
        const fd = new FormData();
        fd.set("productId", productId);
        fd.set("file", new File([blobs[i]], "p.webp", { type: "image/webp" }));
        const pr = await proxyCnImageUpload(fd);
        if (!pr.ok) return pr;
        paths.push(pr.data.path);
      }
      return addProductImages(productId, paths);
    });
  }

  return (
    <Block id={BLOCK_IDS.photos} title={t(L, "product.detail.photos")} foot={<>
      <button className={btn} disabled={locked || s.pending} onClick={() => s.run(() => updateProductImages(productId, rows.map((r, i) => ({ id: r.id, kind: r.kind, source: r.source, usableForSales: r.usable_for_sales, sortOrder: i, colorId: r.color_id }))))}>{t(L, "common.save")}</button>
      <button className={btnSecondary} disabled={locked || s.pending} onClick={() => fileRef.current?.click()}>{s.pending ? t(L, "upload.uploading") : t(L, "upload.add")}</button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {s.msg && <span className={savedMsg}>{s.msg}</span>}
    </>}>
      <p className="text-meta text-ink-2">{t(L, "product.detail.photos.help")}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {rows.map((r, i) => (
          <fieldset key={r.id} disabled={locked} className="min-w-0 space-y-1.5 rounded-ui border border-line bg-paper p-2 text-caption">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
              <img src={urls[r.storage_path]} alt="" className="aspect-[3/4] w-full rounded-ui bg-sand object-cover" />
              <span className="num absolute left-1.5 top-1.5 rounded-sm bg-ink/75 px-1.5 py-0.5 text-micro font-semibold text-paper">{i + 1}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex">
                <button type="button" className={rm} onClick={() => move(i, -1)}>←</button>
                <button type="button" className={rm} onClick={() => move(i, 1)}>→</button>
              </span>
              <span className="flex">
                <button type="button" aria-label={t(L, "common.remove")} className={`${rm} text-crit`} onClick={() => s.run(() => deleteProductImage(productId, r.id), () => setRows((x) => x.filter((y) => y.id !== r.id)))}>×</button>
              </span>
            </div>
            <select className={input} aria-label={t(L, "product.detail.kind")} value={r.kind} onChange={(e) => set(i, { kind: e.target.value })}>
              {IMAGE_KINDS.map((k) => <option key={k} value={k}>{t(L, `product.kind.${k}`)}</option>)}
            </select>
            <select className={input} aria-label={t(L, "product.detail.source")} value={r.source} onChange={(e) => set(i, { source: e.target.value, ...(e.target.value === "reference" && { usable_for_sales: false }) })}>
              {IMAGE_SOURCES.map((k) => <option key={k} value={k}>{t(L, `product.source.${k}`)}</option>)}
            </select>
            <select className={input} aria-label={t(L, "product.detail.color")} value={r.color_id ?? ""} onChange={(e) => set(i, { color_id: e.target.value || null })}>
              <option value="">{t(L, "product.detail.color")} -</option>
              {colors.map((c) => <option key={c.id} value={c.id}>{c.name_zh}</option>)}
            </select>
            <label className="flex min-h-10 items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-signature" disabled={r.source === "reference"} checked={r.usable_for_sales} onChange={(e) => set(i, { usable_for_sales: e.target.checked })} />{t(L, "product.detail.usable")}</label>
          </fieldset>
        ))}
      </div>
    </Block>
  );
}

// ---------------- 컬러 · 사이즈 ----------------
type Color = { id?: string; nameZh: string; nameKo: string; hex: string };
type Size = { id?: string; label: string; measurements: Record<string, number>; source: "vendor" | "measured" };
export function ColorsSizesBlock({ L, productId, locked, category, colors, sizes }: {
  L: Locale; productId: string; locked: boolean; category: string | null;
  colors: { id: string; name_zh: string | null; name_ko: string | null; hex: string | null }[];
  sizes: { id: string; label: string; measurements: Record<string, number>; source: "vendor" | "measured" }[];
}) {
  const [cs, setCs] = useState<Color[]>(colors.map((c) => ({ id: c.id, nameZh: c.name_zh ?? "", nameKo: c.name_ko ?? "", hex: c.hex ?? "" })));
  const [ss, setSs] = useState<Size[]>(sizes.map((s) => ({ id: s.id, label: s.label, measurements: s.measurements ?? {}, source: s.source })));
  const parts = MEASUREMENT_TEMPLATE[category ?? ""] ?? ["length", "shoulder", "chest", "sleeve"];
  const c = useSave(L);
  const z = useSave(L);
  return (
    <Block id={BLOCK_IDS.colorsSizes} title={t(L, "product.detail.colorsSizes")}>
      <fieldset disabled={locked} className="min-w-0 space-y-1.5">
        <div className="eyebrow">{t(L, "product.detail.colors")}</div>
        {cs.map((x, i) => (
          <div key={x.id ?? `n${i}`} className="grid grid-cols-[1fr_1fr_44px_auto] items-center gap-1.5 sm:grid-cols-[1fr_1fr_80px_auto]">
            <input aria-label={t(L, "product.detail.colorName")} className={input} placeholder={t(L, "product.detail.colorName")} value={x.nameZh} onChange={(e) => setCs(cs.map((y, k) => (k === i ? { ...y, nameZh: e.target.value } : y)))} />
            <input aria-label={t(L, "product.detail.colorNameKo")} className={input} placeholder={t(L, "product.detail.colorNameKo")} value={x.nameKo} onChange={(e) => setCs(cs.map((y, k) => (k === i ? { ...y, nameKo: e.target.value } : y)))} />
            <input type="color" className="h-10 w-full cursor-pointer rounded-ui border border-line-strong bg-surface p-0.5" aria-label={t(L, "a11y.colorHex")} value={x.hex || "#888888"} onChange={(e) => setCs(cs.map((y, k) => (k === i ? { ...y, hex: e.target.value } : y)))} />
            <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setCs(cs.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="button" className={addLink} onClick={() => setCs([...cs, { nameZh: "", nameKo: "", hex: "" }])}>{t(L, "product.detail.add")}</button>
          <button type="button" className={btn} disabled={c.pending} onClick={() => c.run(() => saveColors(productId, cs.filter((x) => x.nameZh.trim())))}>{t(L, "common.save")}</button>
          {c.msg && <span className={savedMsg}>{c.msg}</span>}
        </div>
      </fieldset>
      <fieldset disabled={locked} className="min-w-0 space-y-1.5 border-t border-line pt-4">
        <div className="eyebrow">{t(L, "product.detail.sizes")} (cm)</div>
        <div className="overflow-x-auto">
        <table className="text-meta">
          <thead><tr className="text-left text-caption text-ink-2">
            <th className="pb-1 pr-1.5 font-medium">{t(L, "product.detail.sizeLabel")}</th>
            {parts.map((p) => <th key={p} className="pb-1 pr-1.5 font-medium">{codeLabel(MEASUREMENTS, p, L)}</th>)}
            <th>{t(L, "product.detail.measured")}</th><th />
          </tr></thead>
          <tbody>
            {ss.map((x, i) => (
              <tr key={x.id ?? `n${i}`}>
                <td className="pb-1.5 pr-1.5"><input className={`${input} w-16`} aria-label={t(L, "product.detail.sizeLabel")} value={x.label} onChange={(e) => setSs(ss.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)))} /></td>
                {parts.map((p) => (
                  <td key={p} className="pb-1.5 pr-1.5"><input className={`${input} num w-16 px-2 text-center`} aria-label={`${x.label} ${codeLabel(MEASUREMENTS, p, L)}`} inputMode="decimal" value={x.measurements[p] ?? ""} onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    setSs(ss.map((y, k) => { if (k !== i) return y; const m = { ...y.measurements }; if (v === undefined || Number.isNaN(v)) delete m[p]; else m[p] = v; return { ...y, measurements: m }; }));
                  }} /></td>
                ))}
                <td className="text-center"><input type="checkbox" className="h-5 w-5 accent-signature" aria-label={`${x.label} ${t(L, "product.detail.measured")}`} checked={x.source === "measured"} onChange={(e) => setSs(ss.map((y, k) => (k === i ? { ...y, source: e.target.checked ? "measured" : "vendor" } : y)))} /></td>
                <td><button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setSs(ss.filter((_, k) => k !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={addLink} onClick={() => setSs([...ss, { label: "", measurements: {}, source: "vendor" }])}>{t(L, "product.detail.add")}</button>
          <button type="button" className={btn} disabled={z.pending} onClick={() => z.run(() => saveSizes(productId, ss.filter((x) => x.label.trim())))}>{t(L, "common.save")}</button>
          {z.msg && <span className={savedMsg}>{z.msg}</span>}
        </div>
      </fieldset>
    </Block>
  );
}

// ---------------- 소재 · 세탁 ----------------
export function MaterialBlock({ L, productId, locked, fabric, origin, care }: { L: Locale; productId: string; locked: boolean; fabric: { material_code: string; pct: number }[]; origin: string | null; care: string[] }) {
  const [rows, setRows] = useState(fabric.length ? fabric : [{ material_code: "polyester", pct: 100 }]);
  const [o, setO] = useState(origin ?? "CN");
  const [cc, setCc] = useState(care);
  const s = useSave(L);
  const sum = Math.round(rows.reduce((a, r) => a + (Number(r.pct) || 0), 0) * 10) / 10;
  return (
    <Block id={BLOCK_IDS.material} title={t(L, "product.detail.material")} foot={<>
      <button className={btn} disabled={locked || s.pending} onClick={() => s.run(() => updateProduct(productId, { fabric: rows.filter((r) => r.pct > 0), origin: o, careCodes: cc }))}>{t(L, "common.save")}</button>
      {s.msg && <span className={savedMsg}>{s.msg}</span>}
    </>}>
      <fieldset disabled={locked} className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <div className="text-caption font-medium text-ink-2">{t(L, "product.detail.fabric")} · <span className={`num ${sum === 100 ? "text-signature" : "text-warn"}`}>{t(L, "product.detail.fabricSum", { n: sum })}</span></div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_auto] items-center gap-1.5">
              <select className={input} aria-label={t(L, "a11y.material")} value={r.material_code} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, material_code: e.target.value } : x)))}>
                {MATERIALS.map((m) => <option key={m.code} value={m.code}>{L === "ko" ? m.ko : m.zh}</option>)}
              </select>
              <input className={`${input} num`} aria-label={t(L, "a11y.materialPct")} inputMode="decimal" value={r.pct} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, pct: Number(e.target.value) || 0 } : x)))} />
              <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          {rows.length < 6 && <button type="button" className={addLink} onClick={() => setRows([...rows, { material_code: "spandex", pct: 0 }])}>{t(L, "product.detail.add")}</button>}
        </div>
        <label className={`${lbl} w-48`}>{t(L, "product.detail.origin")}
          <select className={input} value={o} onChange={(e) => setO(e.target.value)}>
            {ORIGINS.map((x) => <option key={x.code} value={x.code}>{L === "ko" ? x.ko : x.zh}</option>)}
          </select>
        </label>
        <div>
          <div className="text-caption font-medium text-ink-2">{t(L, "product.detail.care")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CARE.map((x) => (
              <button key={x.code} type="button" onClick={() => setCc(cc.includes(x.code) ? cc.filter((y) => y !== x.code) : [...cc, x.code])}
                aria-pressed={cc.includes(x.code)} className="chip min-h-10" data-active={cc.includes(x.code) ? "true" : undefined}>{L === "ko" ? x.ko : x.zh}</button>
            ))}
          </div>
        </div>
      </fieldset>
    </Block>
  );
}

// ---------------- 가격 · 공급 ----------------
export function SupplyBlock({ L, vendor = false, productId, locked, published, tiers, p }: {
  L: Locale; vendor?: boolean; productId: string; locked: boolean; published: boolean; tiers: { min_qty: number; cost_cny: number }[];
  p: { supply_type: string | null; lead_days: number | null; production_moq: number | null; min_qty: number | null; weight_g: number | null; sample_ok: boolean; sample_cost_cny: number | null };
}) {
  const [ts, setTs] = useState(tiers.length ? tiers.map((x) => ({ qty: String(x.min_qty), cost: String(x.cost_cny) })) : [{ qty: "1", cost: "" }]);
  const [f, setF] = useState({ supplyType: p.supply_type ?? "", leadDays: p.lead_days?.toString() ?? "", productionMoq: p.production_moq?.toString() ?? "", minQty: p.min_qty?.toString() ?? "", weightG: p.weight_g?.toString() ?? "", sampleOk: p.sample_ok, sampleCost: p.sample_cost_cny?.toString() ?? "" });
  const s = useSave(L);
  const n = (v: string) => (v === "" ? null : Number(v));
  const filled = ts.filter((x) => x.qty && x.cost);
  const tiersChanged = JSON.stringify(filled.map((x) => [Number(x.qty), Number(x.cost)])) !== JSON.stringify(tiers.map((x) => [x.min_qty, x.cost_cny]));
  const num = (k: keyof typeof f) => (
    <input className={`${input} num`} inputMode="numeric" value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
  );
  return (
    <Block id={BLOCK_IDS.supply} title={t(L, "product.detail.supply")} foot={<>
      <button className={btn} disabled={locked || s.pending} onClick={() => s.run(() => updateProduct(productId, {
        ...(tiersChanged && { costTiers: filled.map((x) => ({ min_qty: Number(x.qty), cost_cny: Number(x.cost) })) }),
        ...(f.supplyType !== (p.supply_type ?? "") && { supplyType: f.supplyType || null }),
        ...(n(f.leadDays) !== p.lead_days && { leadDays: n(f.leadDays) }),
        ...(n(f.productionMoq) !== p.production_moq && { productionMoq: n(f.productionMoq) }),
        ...(n(f.minQty) !== p.min_qty && { minQty: n(f.minQty) }),
        weightG: n(f.weightG), sampleOk: f.sampleOk, sampleCostCny: n(f.sampleCost),
      }))}>{t(L, "common.save")}</button>
      {s.msg && <span className={savedMsg}>{s.msg}</span>}
    </>}>
      {published && <p className="rounded-ui border-l-2 border-warn bg-warn-soft px-3 py-2 text-meta text-warn">{t(L, "product.detail.recheckWarn")}</p>}
      <fieldset disabled={locked} className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          {ts.map((x, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
              <input className={`${input} num`} aria-label={t(L, "product.cost.qty")} placeholder={t(L, "product.cost.qty")} inputMode="numeric" value={x.qty} onChange={(e) => setTs(ts.map((y, k) => (k === i ? { ...y, qty: e.target.value.replace(/\D/g, "") } : y)))} />
              <input className={`${input} num text-h5 font-semibold`} aria-label={tFor(vendor)(L, "product.cost")} placeholder={tFor(vendor)(L, "product.cost")} inputMode="decimal" value={x.cost} onChange={(e) => setTs(ts.map((y, k) => (k === i ? { ...y, cost: e.target.value.replace(/[^\d.]/g, "") } : y)))} />
              <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setTs(ts.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          <button type="button" className={addLink} onClick={() => setTs([...ts, { qty: "", cost: "" }])}>{t(L, "product.cost.addTier")}</button>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4 md:grid-cols-4">
          <label className={lbl}>{t(L, "product.detail.supplyType")}
            <select className={input} value={f.supplyType} onChange={(e) => setF({ ...f, supplyType: e.target.value })}>
              <option value="">-</option>
              {SUPPLY_TYPES.map((x) => <option key={x} value={x}>{t(L, `product.supply.${x}`)}</option>)}
            </select>
          </label>
          <label className={lbl}>{t(L, "product.detail.leadDays")}{num("leadDays")}</label>
          <label className={lbl}>{t(L, "product.detail.productionMoq")}{num("productionMoq")}</label>
          <label className={lbl}>{t(L, "product.detail.minQty")}{num("minQty")}</label>
          <label className={lbl}>{t(L, "product.detail.weight")}{num("weightG")}</label>
          <label className={lbl}>{t(L, "product.detail.sampleCost")}{num("sampleCost")}</label>
          <label className="flex min-h-10 items-end gap-2 pb-2 text-body"><input type="checkbox" className="h-5 w-5 accent-signature" checked={f.sampleOk} onChange={(e) => setF({ ...f, sampleOk: e.target.checked })} />{t(L, "product.sampleOk")}</label>
        </div>
      </fieldset>
    </Block>
  );
}

// ---------------- 원청 기본값 상속 ----------------
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);
type Hold = { none: true } | { deposit_pct: number; days: number };
export function InheritBlock({ L, productId, locked, vendor, overrides }: {
  L: Locale; productId: string; locked: boolean;
  vendor: { default_hold: Hold; default_label_options: LabelRow[]; default_mod_options: ModRow[] } | null;
  overrides: { hold: Hold | null; labels: LabelRow[] | null; mods: ModRow[] | null };
}) {
  const [hold, setHold] = useState<Hold | null>(overrides.hold);
  const [labels, setLabels] = useState<LabelRow[] | null>(overrides.labels);
  const [mods, setMods] = useState<ModRow[] | null>(overrides.mods);
  const s = useSave(L);
  const holdText = (h: Hold | null | undefined) => (!h ? "-" : "none" in h ? t(L, "product.detail.hold.none") : t(L, "product.detail.hold.deposit", { pct: Math.round(h.deposit_pct * 100), days: h.days }));
  const labelTypes = ["main_label", "care_label", "hangtag", "polybag", "tag_attach"].map((code) => ({ code, label: t(L, `product.option.labelType.${code}`) }));
  const rowLabels = { item: t(L, "product.option.item"), moq: t(L, "product.option.moq"), cost: t(L, "product.option.cost"), lead: t(L, "product.option.lead"), add: t(L, "product.detail.add"), remove: "×", removeLabel: t(L, "common.remove") };
  const toggle = (on: boolean, set: (v: never) => void, init: unknown) => set((on ? init : null) as never);
  return (
    <Block id={BLOCK_IDS.inherit} title={t(L, "product.detail.inherit")} foot={<>
      <button className={btn} disabled={locked || s.pending} onClick={() => s.run(() => updateProduct(productId, {
        // 바뀐 것만 보낸다 — 홀딩 변경은 공개 상품이면 재확인을 부른다(RECHECK_FIELDS)
        ...(same(hold, overrides.hold) ? {} : { holdOverride: hold }),
        ...(same(labels, overrides.labels) ? {} : { labelOptionsOverride: labels }),
        ...(same(mods, overrides.mods) ? {} : { modOptionsOverride: mods }),
      }))}>{t(L, "common.save")}</button>
      {s.msg && <span className={savedMsg}>{s.msg}</span>}
    </>}>
      <fieldset disabled={locked} className="min-w-0 divide-y divide-line text-body [&>div]:py-3 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{t(L, "product.detail.hold")}</span>
            <label className="flex min-h-10 items-center gap-1.5 text-meta text-ink-2"><input type="checkbox" className="h-4 w-4 accent-signature" checked={hold !== null} onChange={(e) => toggle(e.target.checked, setHold, vendor?.default_hold ?? { none: true })} />{t(L, "product.detail.override")}</label>
          </div>
          {hold === null ? (
            <p className="mt-1 text-ink-2">{t(L, "product.detail.inherited")}: {holdText(vendor?.default_hold)}</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select className={`${input} w-auto max-w-full`} aria-label={t(L, "product.detail.hold")} value={"none" in hold ? "none" : "deposit"} onChange={(e) => setHold(e.target.value === "none" ? { none: true } : { deposit_pct: 0.3, days: 7 })}>
                <option value="none">{t(L, "product.detail.hold.none")}</option>
                <option value="deposit">{t(L, "product.detail.hold.deposit", { pct: "N", days: "M" })}</option>
              </select>
              {!("none" in hold) && (
                <>
                  <input className={`${input} num w-20`} aria-label={t(L, "a11y.holdPct")} inputMode="numeric" value={Math.round(hold.deposit_pct * 100)} onChange={(e) => setHold({ ...hold, deposit_pct: Math.min(100, Number(e.target.value) || 0) / 100 })} />%
                  <input className={`${input} num w-20`} aria-label={t(L, "a11y.holdDays")} inputMode="numeric" value={hold.days} onChange={(e) => setHold({ ...hold, days: Number(e.target.value) || 0 })} />d
                </>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{t(L, "product.detail.labels")}</span>
            <label className="flex min-h-10 items-center gap-1.5 text-meta text-ink-2"><input type="checkbox" className="h-4 w-4 accent-signature" checked={labels !== null} onChange={(e) => toggle(e.target.checked, setLabels, vendor?.default_label_options ?? [])} />{t(L, "product.detail.override")}</label>
          </div>
          <div className="mt-1 overflow-x-auto"><LabelRows rows={labels ?? vendor?.default_label_options ?? []} onChange={setLabels} types={labelTypes} labels={rowLabels} disabled={labels === null} /></div>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{t(L, "product.detail.mods")}</span>
            <label className="flex min-h-10 items-center gap-1.5 text-meta text-ink-2"><input type="checkbox" className="h-4 w-4 accent-signature" checked={mods !== null} onChange={(e) => toggle(e.target.checked, setMods, vendor?.default_mod_options ?? [])} />{t(L, "product.detail.override")}</label>
          </div>
          <div className="mt-1 overflow-x-auto"><ModRows rows={mods ?? vendor?.default_mod_options ?? []} onChange={setMods} labels={rowLabels} items={MOD_ITEMS.map((code) => ({ code, label: t(L, `product.option.mod.${code}`) }))} disabled={mods === null} /></div>
        </div>
      </fieldset>
    </Block>
  );
}

// ---------------- 공개 조건 + 검수 요청 ----------------
export function Checklist({ L, vendor = false, productId, checks, canSubmit }: { L: Locale; vendor?: boolean; productId: string; checks: { key: string; ok: boolean }[]; canSubmit: boolean }) {
  const s = useSave(L);
  const ok = checks.every((c) => c.ok);
  const done = checks.filter((c) => c.ok).length;
  const pct = checks.length ? Math.round((done / checks.length) * 100) : 0;
  return (
    <div id={BLOCK_IDS.checklist} className="card scroll-mt-28 overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-h5 font-semibold">{t(L, "product.detail.checklist")}</h2>
          <span className={`num text-h4 font-semibold ${ok ? "text-signature" : "text-ink"}`}>{done}<span className="text-meta text-muted">/{checks.length}</span></span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand" aria-hidden>
          <div className={`h-full ${ok ? "bg-signature" : "bg-warn"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="divide-y divide-line px-4 text-body">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 py-2">
            <span aria-hidden className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-micro font-bold ${c.ok ? "bg-signature text-paper" : "border border-warn text-warn"}`}>{c.ok ? "✓" : ""}</span>
            <span className={c.ok ? "text-ink-2" : "font-medium text-ink"}>{tFor(vendor)(L, `product.check.${c.key}`)}</span>
          </li>
        ))}
      </ul>
      {(canSubmit || s.msg) && (
        <div className="space-y-2 border-t border-line bg-paper/60 px-4 py-3">
          {canSubmit && (
            <button className="btn btn-accent btn-lg min-h-11 w-full" disabled={!ok || s.pending} onClick={() => s.run(() => requestReview(productId))}>
              {s.pending ? t(L, "product.detail.submitting") : t(L, "product.detail.submit")}
            </button>
          )}
          {s.msg && <p className="text-meta text-ink-2">{s.msg}</p>}
        </div>
      )}
    </div>
  );
}
