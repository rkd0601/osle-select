"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { photoErrorKey, shrinkPhoto } from "@/lib/images/resize";
import { BUCKETS } from "@/lib/config";
import { t, tFor, type Locale } from "@/lib/i18n/cn";
import { CARE, CATEGORY_ZH, MOD_ITEMS, IMAGE_KINDS, IMAGE_SOURCES, MATERIALS, MEASUREMENTS, MEASUREMENT_TEMPLATE, ORIGINS, SUPPLY_TYPES, label as codeLabel } from "@/lib/codes";
import { LabelRows, ModRows, type LabelRow, type ModRow } from "@/components/domain/option-rows";
import { BLOCK_IDS } from "./block-ids";
import { Seg } from "../seg";
import { stableJson } from "@/lib/json"; // lib/products는 zod를 끌고 온다 — 클라이언트 번들 예산
import {
  addProductImages, deleteProduct, deleteProductImage, issueProductImageUploads, proxyCnImageUpload, requestReview, saveColors, saveSizes, updateProduct, updateProductImages,
} from "../actions";

/**
 * C-03 상품 상세 입력. 블록마다 저장 → 서버가 공개 조건을 다시 계산해 router.refresh()로 체크리스트 갱신.
 * locked(검수 대기 등)면 입력 전체 비활성. 원가·옵션 단가(CNY)는 CN·ADMIN 화면에만 존재한다.
 * 디자인 v2: 블록 = 룰로 나눈 섹션(카드 없음), 밑줄 입력(.field), 예/아니오·상속/예외는 세그먼트(.seg).
 */
type R = { ok: true } | { ok: false; error: string };
const input = "field disabled:text-ink-2";
const btn = "btn sec";
const btnSecondary = "btn sec";
const addLink = "inline-flex min-h-10 items-center text-meta text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";
const rm = "inline-flex min-h-10 min-w-10 items-center justify-center text-lead text-ink-2 hover:text-crit disabled:opacity-40";
const lbl = "flex min-w-0 flex-col gap-1.5 text-caption text-muted";
const sub = "text-body font-medium text-ink";
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

function Block({ id, title, aside, children, foot }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section id={id} className="section scroll-mt-20">
      <div className="section-h"><h2>{title}</h2>{aside}</div>
      <div className="space-y-5 pt-5">{children}</div>
      {foot && <div className="flex flex-wrap items-center gap-3 pt-6">{foot}</div>}
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
      <fieldset disabled={locked} className="grid min-w-0 gap-x-6 gap-y-5 md:grid-cols-2">
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
          <textarea className={input} value={f.descZh} maxLength={2000} onChange={(e) => setF({ ...f, descZh: e.target.value })} />
        </label>
        <label className={`${lbl} md:col-span-2`}>{t(L, "product.detail.qualityNote")}
          <textarea className={input} value={f.qualityNoteZh} maxLength={1000} onChange={(e) => setF({ ...f, qualityNoteZh: e.target.value })} />
        </label>
        <div className="flex items-end">
          <Seg label={t(L, "product.detail.verified")} value={f.verified ? "yes" : "no"} onChange={(k) => setF({ ...f, verified: k === "yes" })}
            options={[["yes", t(L, "product.detail.verified")], ["no", t(L, "cn.detail.notVerified")]]} />
        </div>
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
    const picked = [...files].slice(0, 15);
    s.run(async () => {
      let blobs: Blob[];
      try {
        blobs = await Promise.all(picked.map((f) => shrinkPhoto(f)));
      } catch (e) {
        return { ok: false as const, error: photoErrorKey(e) }; // HEIC 등 — 조용히 실패하지 않는다 (P3)
      }
      const issued = await issueProductImageUploads(productId, blobs.length);
      if (!issued.ok) return issued;
      const paths: string[] = [];
      for (let i = 0; i < blobs.length; i++) {
        const { path, token } = issued.data[i];
        if (await uploadToSignedUrl(BUCKETS.productImages, path, token, blobs[i])) { paths.push(path); continue; }
        const fd = new FormData();
        fd.set("productId", productId);
        fd.set("file", new File([blobs[i]], "p.jpg", { type: "image/jpeg" }));
        const pr = await proxyCnImageUpload(fd);
        if (!pr.ok) return pr;
        paths.push(pr.data.path);
      }
      return addProductImages(productId, paths);
    });
  }

  return (
    <Block id={BLOCK_IDS.photos} title={t(L, "product.detail.photos")} aside={<span className="count num">{rows.length}</span>} foot={<>
      <button className={btn} disabled={locked || s.pending} onClick={() => s.run(() => updateProductImages(productId, rows.map((r, i) => ({ id: r.id, kind: r.kind, source: r.source, usableForSales: r.usable_for_sales, sortOrder: i, colorId: r.color_id }))))}>{t(L, "common.save")}</button>
      <button className={btnSecondary} disabled={locked || s.pending} onClick={() => fileRef.current?.click()}>{s.pending ? t(L, "upload.uploading") : t(L, "upload.add")}</button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {s.msg && <span className={savedMsg}>{s.msg}</span>}
    </>}>
      <p className="text-meta text-ink-2">{t(L, "product.detail.photos.help")}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5">
        {rows.map((r, i) => (
          <fieldset key={r.id} disabled={locked} className="min-w-0 space-y-2 text-caption">
            <div className="photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
              <img src={urls[r.storage_path]} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <span className="tag">{i + 1}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line">
              <span className="flex gap-3">
                <button type="button" className="inline-flex min-h-10 items-center text-meta text-ink-2 hover:text-ink disabled:opacity-40" onClick={() => move(i, -1)}>{t(L, "cn.detail.moveUp")}</button>
                <button type="button" className="inline-flex min-h-10 items-center text-meta text-ink-2 hover:text-ink disabled:opacity-40" onClick={() => move(i, 1)}>{t(L, "cn.detail.moveDown")}</button>
              </span>
              <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => s.run(() => deleteProductImage(productId, r.id), () => setRows((x) => x.filter((y) => y.id !== r.id)))}>×</button>
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
            <label className="flex min-h-10 items-center gap-2 text-meta text-ink-2"><input type="checkbox" className="h-4 w-4 accent-ink" disabled={r.source === "reference"} checked={r.usable_for_sales} onChange={(e) => set(i, { usable_for_sales: e.target.checked })} />{t(L, "product.detail.usable")}</label>
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
      <fieldset disabled={locked} className="min-w-0 space-y-2">
        <h3 className={sub}>{t(L, "product.detail.colors")}</h3>
        {cs.map((x, i) => (
          <div key={x.id ?? `n${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px_auto] items-center gap-3 sm:grid-cols-[1fr_1fr_64px_auto]">
            <input aria-label={t(L, "product.detail.colorName")} className={input} placeholder={t(L, "product.detail.colorName")} value={x.nameZh} onChange={(e) => setCs(cs.map((y, k) => (k === i ? { ...y, nameZh: e.target.value } : y)))} />
            <input aria-label={t(L, "product.detail.colorNameKo")} className={input} placeholder={t(L, "product.detail.colorNameKo")} value={x.nameKo} onChange={(e) => setCs(cs.map((y, k) => (k === i ? { ...y, nameKo: e.target.value } : y)))} />
            <input type="color" className="h-10 w-full cursor-pointer border border-line-strong bg-transparent p-0.5" aria-label={t(L, "a11y.colorHex")} value={x.hex || "#888888"} onChange={(e) => setCs(cs.map((y, k) => (k === i ? { ...y, hex: e.target.value } : y)))} />
            <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setCs(cs.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="button" className={addLink} onClick={() => setCs([...cs, { nameZh: "", nameKo: "", hex: "" }])}>{t(L, "product.detail.add")}</button>
          <button type="button" className={btn} disabled={c.pending} onClick={() => c.run(() => saveColors(productId, cs.filter((x) => x.nameZh.trim())))}>{t(L, "common.save")}</button>
          {c.msg && <span className={savedMsg}>{c.msg}</span>}
        </div>
      </fieldset>
      <fieldset disabled={locked} className="min-w-0 space-y-2 border-t border-line pt-5">
        <h3 className={sub}>{t(L, "product.detail.sizes")} <span className="num text-meta font-normal text-muted">cm</span></h3>
        <div className="overflow-x-auto">
        <table className="text-meta">
          <thead><tr className="text-left text-caption text-muted">
            <th className="border-b border-line-strong pb-2 pr-3 font-normal">{t(L, "product.detail.sizeLabel")}</th>
            {parts.map((p) => <th key={p} className="border-b border-line-strong pb-2 pr-3 font-normal">{codeLabel(MEASUREMENTS, p, L)}</th>)}
            <th className="border-b border-line-strong pb-2 pr-3 font-normal">{t(L, "product.detail.measured")}</th><th className="border-b border-line-strong" />
          </tr></thead>
          <tbody>
            {ss.map((x, i) => (
              <tr key={x.id ?? `n${i}`}>
                <td className="py-1 pr-3"><input className={`${input} w-16`} aria-label={t(L, "product.detail.sizeLabel")} value={x.label} onChange={(e) => setSs(ss.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)))} /></td>
                {parts.map((p) => (
                  <td key={p} className="py-1 pr-3"><input className={`${input} num w-16 px-2 text-center`} aria-label={`${x.label} ${codeLabel(MEASUREMENTS, p, L)}`} inputMode="decimal" value={x.measurements[p] ?? ""} onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    setSs(ss.map((y, k) => { if (k !== i) return y; const m = { ...y.measurements }; if (v === undefined || Number.isNaN(v)) delete m[p]; else m[p] = v; return { ...y, measurements: m }; }));
                  }} /></td>
                ))}
                <td className="pr-3 text-center"><input type="checkbox" className="h-5 w-5 accent-ink" aria-label={`${x.label} ${t(L, "product.detail.measured")}`} checked={x.source === "measured"} onChange={(e) => setSs(ss.map((y, k) => (k === i ? { ...y, source: e.target.checked ? "measured" : "vendor" } : y)))} /></td>
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
      <fieldset disabled={locked} className="min-w-0 space-y-6">
        <div className="space-y-2">
          <h3 className={sub}>{t(L, "product.detail.fabric")} <span className={`num ml-2 text-meta font-normal ${sum === 100 ? "text-ok" : "text-warn"}`}>{t(L, "product.detail.fabricSum", { n: sum })}</span></h3>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-center gap-3">
              <select className={input} aria-label={t(L, "a11y.material")} value={r.material_code} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, material_code: e.target.value } : x)))}>
                {MATERIALS.map((m) => <option key={m.code} value={m.code}>{L === "ko" ? m.ko : m.zh}</option>)}
              </select>
              <input className={`${input} num`} aria-label={t(L, "a11y.materialPct")} inputMode="decimal" value={r.pct} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, pct: Number(e.target.value) || 0 } : x)))} />
              <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          {rows.length < 6 && <button type="button" className={addLink} onClick={() => setRows([...rows, { material_code: "spandex", pct: 0 }])}>{t(L, "product.detail.add")}</button>}
        </div>
        <label className={`${lbl} w-full max-w-60`}>{t(L, "product.detail.origin")}
          <select className={input} value={o} onChange={(e) => setO(e.target.value)}>
            {ORIGINS.map((x) => <option key={x.code} value={x.code}>{L === "ko" ? x.ko : x.zh}</option>)}
          </select>
        </label>
        <div>
          <h3 className={sub}>{t(L, "product.detail.care")}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
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
      {published && <p className="border-l-2 border-warn pl-3 text-meta text-warn">{t(L, "product.detail.recheckWarn")}</p>}
      <fieldset disabled={locked} className="min-w-0 space-y-6">
        <div className="space-y-2">
          <div aria-hidden className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-4 text-caption text-muted">
            <span>{t(L, "product.cost.qty")}</span><span>{tFor(vendor)(L, "product.cost")}</span>
          </div>
          {ts.map((x, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4">
              <input className={`${input} num`} aria-label={t(L, "product.cost.qty")} placeholder={t(L, "product.cost.qty")} inputMode="numeric" value={x.qty} onChange={(e) => setTs(ts.map((y, k) => (k === i ? { ...y, qty: e.target.value.replace(/\D/g, "") } : y)))} />
              <input className={`${input} num text-h4 font-light`} aria-label={tFor(vendor)(L, "product.cost")} placeholder={tFor(vendor)(L, "product.cost")} inputMode="decimal" value={x.cost} onChange={(e) => setTs(ts.map((y, k) => (k === i ? { ...y, cost: e.target.value.replace(/[^\d.]/g, "") } : y)))} />
              <button type="button" aria-label={t(L, "common.remove")} className={rm} onClick={() => setTs(ts.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          <button type="button" className={addLink} onClick={() => setTs([...ts, { qty: "", cost: "" }])}>{t(L, "product.cost.addTier")}</button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 md:grid-cols-3">
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
          <div className="col-span-2 md:col-span-3">
            <Seg label={t(L, "product.sampleOk")} value={f.sampleOk ? "yes" : "no"} onChange={(k) => setF({ ...f, sampleOk: k === "yes" })}
              options={[["yes", t(L, "product.sampleOk")], ["no", t(L, "cn.detail.noSample")]]} />
          </div>
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
  const seg: ["inherit" | "override", string][] = [["inherit", t(L, "product.detail.inherited")], ["override", t(L, "product.detail.override")]];
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
      <fieldset disabled={locked} className="min-w-0 divide-y divide-line text-body [&>div]:py-5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className={sub}>{t(L, "product.detail.hold")}</h3>
            <Seg label={t(L, "product.detail.hold")} value={hold !== null ? "override" : "inherit"} onChange={(k) => toggle(k === "override", setHold, vendor?.default_hold ?? { none: true })} options={seg} />
          </div>
          {hold === null ? (
            <p className="mt-2 text-ink-2">{holdText(vendor?.default_hold)}</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
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
            <h3 className={sub}>{t(L, "product.detail.labels")}</h3>
            <Seg label={t(L, "product.detail.labels")} value={labels !== null ? "override" : "inherit"} onChange={(k) => toggle(k === "override", setLabels, vendor?.default_label_options ?? [])} options={seg} />
          </div>
          <div className="mt-3 overflow-x-auto"><LabelRows rows={labels ?? vendor?.default_label_options ?? []} onChange={setLabels} types={labelTypes} labels={rowLabels} disabled={labels === null} /></div>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className={sub}>{t(L, "product.detail.mods")}</h3>
            <Seg label={t(L, "product.detail.mods")} value={mods !== null ? "override" : "inherit"} onChange={(k) => toggle(k === "override", setMods, vendor?.default_mod_options ?? [])} options={seg} />
          </div>
          <div className="mt-3 overflow-x-auto"><ModRows rows={mods ?? vendor?.default_mod_options ?? []} onChange={setMods} labels={rowLabels} items={MOD_ITEMS.map((code) => ({ code, label: t(L, `product.option.mod.${code}`) }))} disabled={mods === null} /></div>
        </div>
      </fieldset>
    </Block>
  );
}

// ---------------- 공개 조건 + 검수 요청 ----------------
export function Checklist({ L, vendor = false, productId, checks, canSubmit }: { L: Locale; vendor?: boolean; productId: string; checks: { key: string; ok: boolean; required: boolean }[]; canSubmit: boolean }) {
  const s = useSave(L);
  const required = checks.filter((c) => c.required);
  const recommended = checks.filter((c) => !c.required);
  const ok = required.every((c) => c.ok); // 권장 조건은 막지 않는다 (11-09 완화)
  const done = required.filter((c) => c.ok).length;
  const group = (title: string, list: typeof checks, missTone: "warn" | "wait") => (
    <>
      <p className="pt-4 text-caption text-muted">{title}</p>
      <ul>
        {list.map((c) => (
          <li key={c.key} className="flex min-h-11 items-center border-b border-line py-2">
            <span className={`st whitespace-normal ${c.ok ? "done" : missTone}`}>{tFor(vendor)(L, `product.check.${c.key}`)}</span>
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <section id={BLOCK_IDS.checklist} className="section scroll-mt-20">
      <div className="section-h">
        <h2>{t(L, "product.detail.checklist")}</h2>
        <span className="num" style={{ fontSize: "var(--fs-h2)", fontWeight: 300, color: ok ? "var(--ok)" : undefined }}>{done}<span className="text-meta text-muted">/{required.length}</span></span>
      </div>
      {group(t(L, "product.check.required"), required, "warn")}
      {group(t(L, "product.check.recommended"), recommended, "wait")}
      {(canSubmit || s.msg) && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-6">
          {s.msg && <p role="status" className="text-meta text-ink-2">{s.msg}</p>}
          {canSubmit && (
            <button className="btn lg max-sm:w-full" disabled={!ok || s.pending} onClick={() => s.run(() => requestReview(productId))}>
              {s.pending ? t(L, "product.detail.submitting") : t(L, "product.detail.submit")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** 상품 삭제 (사이트 수정 5): 임시저장·반려 + 제안 없음일 때만 페이지가 보여 준다. 서버가 다시 검사한다 */
export function DeleteProduct({ L, productId }: { L: Locale; productId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="section">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn sec text-crit" disabled={pending} onClick={() => {
          if (!window.confirm(t(L, "product.delete.confirm"))) return;
          start(async () => {
            setMsg(null);
            const res = await deleteProduct(productId);
            if (!res.ok) return setMsg(t(L, res.error));
            router.replace("/cn/products");
            router.refresh();
          });
        }}>{pending ? t(L, "common.saving") : t(L, "product.delete.button")}</button>
        <span className="text-meta text-ink-2">{msg ?? t(L, "product.delete.help")}</span>
      </div>
    </section>
  );
}
