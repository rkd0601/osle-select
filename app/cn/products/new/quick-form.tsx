"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { resizeToWebp } from "@/lib/images/resize";
import { BUCKETS } from "@/lib/config";
import { t, tFor, type Locale } from "@/lib/i18n/cn";
import { flushAll, flushEntry, isRejected, listEntries, putEntry, removeEntry, type QueueEntry, type Uploader } from "@/lib/offline/queue";
import { createQuickProduct, issueProductImageUploads, issueVendorCardUpload, proxyCnImageUpload } from "../actions";

type Vendor = { id: string; name: string; market: string | null; booth: string | null; default_sample_ok: boolean };
type Shot = { blob: Blob; preview: string; camera: boolean };
type Tier = { qty: string; cost: string };

/** 서명 URL 직접 업로드 → 실패 시 서버 프록시. 둘 다 실패하면 throw(큐가 재시도) */
function makeUploader(): Uploader {
  const viaProxy = async (fd: FormData) => {
    const r = await proxyCnImageUpload(fd);
    if (!r.ok) throw new Error(r.error);
    return r.data.path;
  };
  return {
    async uploadProductImage(productId, blob) {
      const issued = await issueProductImageUploads(productId, 1);
      if (issued.ok) {
        const { path, token } = issued.data[0];
        if (await uploadToSignedUrl(BUCKETS.productImages, path, token, blob)) return path;
      }
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("file", new File([blob], "p.webp", { type: "image/webp" }));
      return viaProxy(fd);
    },
    async uploadVendorCard(blob) {
      const issued = await issueVendorCardUpload();
      if (issued.ok) {
        if (await uploadToSignedUrl(BUCKETS.vendorCards, issued.data.path, issued.data.token, blob)) return issued.data.path;
      }
      const fd = new FormData();
      fd.set("kind", "vendor");
      fd.set("file", new File([blob], "v.webp", { type: "image/webp" }));
      return viaProxy(fd);
    },
    create: (input) => createQuickProduct(input),
  };
}

const big = "w-full rounded-ui py-4 text-h5 font-semibold";
const field = "w-full border-0 border-b border-line bg-transparent py-2 text-h5 outline-none focus:border-ink";

/**
 * C-02 상품 간단 등록 (모바일, 한 화면). 최소 세트: 사진 1장 + 원가 + 원청 (기획서 F2).
 * 저장은 먼저 IndexedDB에 넣고(유실 방지) 바로 전송을 시도한다. 실패하면 online 이벤트에 자동 재전송.
 */
export function QuickForm({ locale, actorId, vendors, vendorLocked = false, itemId, itemLabel }: { locale: Locale; actorId: string; vendors: Vendor[]; vendorLocked?: boolean; itemId: string | null; itemLabel: string | null }) {
  const L = locale;
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLInputElement>(null);
  const [productId, setProductId] = useState(() => crypto.randomUUID());
  const [newVendorId, setNewVendorId] = useState(() => crypto.randomUUID()); // 원청 멱등 생성용
  const [shots, setShots] = useState<Shot[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([{ qty: "1", cost: "" }]);
  const [vendorId, setVendorId] = useState<string | null>(vendors[0]?.id ?? null);
  const [newVendor, setNewVendor] = useState<{ name: string; market: string; booth: string; wechat: string } | null>(vendors.length ? null : { name: "", market: "", booth: "", wechat: "" });
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [nameZh, setNameZh] = useState("");
  const [memoZh, setMemoZh] = useState("");
  const [sampleOk, setSampleOk] = useState(vendors[0]?.default_sample_ok ?? true);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejected, setRejected] = useState<QueueEntry[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string; href?: string } | null>(null);
  const [busy, start] = useTransition();

  const refreshCount = useCallback(
    () =>
      listEntries()
        .then((all) => {
          const mine = all.filter((e) => e.actorId === actorId);
          setPendingCount(mine.filter((e) => !isRejected(e)).length);
          setRejected(mine.filter(isRejected));
        })
        .catch(() => {}),
    [actorId],
  );
  const flush = useCallback(() => {
    flushAll(makeUploader(), actorId).then(refreshCount).catch(() => {});
  }, [refreshCount, actorId]);
  useEffect(() => {
    refreshCount();
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush, refreshCount]);

  async function addShots(files: FileList | null, fromCamera: boolean) {
    if (!files?.length) return;
    const blobs = await Promise.all([...files].slice(0, 15 - shots.length).map(resizeToWebp));
    setShots((s) => [...s, ...blobs.map((blob) => ({ blob, preview: URL.createObjectURL(blob), camera: fromCamera }))]);
  }

  const parsedTiers = tiers.map((x) => ({ min_qty: Number(x.qty), cost_cny: Number(x.cost) })).filter((x) => x.min_qty > 0 && Number.isFinite(x.cost_cny));
  const vendorOk = newVendor ? !!newVendor.name.trim() : !!vendorId;
  const ready = shots.length > 0 && tiers.every((x) => x.qty && x.cost) && vendorOk;

  const reset = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.preview));
    setShots([]);
    setTiers([{ qty: "1", cost: "" }]);
    setNameZh("");
    setMemoZh("");
    setCardBlob(null);
    setProductId(crypto.randomUUID());
    if (newVendor) setNewVendorId(crypto.randomUUID());
  };

  const save = () =>
    start(async () => {
      setMsg(null);
      const entry: QueueEntry = {
        productId,
        actorId,
        createdAt: Date.now(),
        input: {
          requestItemId: itemId,
          imageCaptured: shots.map((s) => s.camera),
          costTiers: parsedTiers,
          vendorId: newVendor ? null : vendorId,
          newVendor: newVendor ? { ...newVendor, id: newVendorId, cardImagePath: null } : null,
          nameZh,
          memoZh,
          sampleOk,
        },
        blobs: shots.map((s) => s.blob),
        uploaded: shots.map(() => null),
        vendorCard: newVendor ? cardBlob : null,
        vendorCardPath: null,
      };
      let putOk = true;
      try {
        await putEntry(entry);
      } catch {
        putOk = false; /* 사생활 보호 모드 등 IndexedDB 불가 — 바로 전송만 시도. 실패하면 폼을 비우지 않는다(입력·사진 유실 방지) */
      }
      const r = await flushEntry(entry, makeUploader());
      await refreshCount();
      if (r === "busy") return;
      if (r === "done") {
        setMsg({ tone: "ok", text: t(L, "product.saved"), href: `/cn/products/${productId}` });
        reset();
      } else if (r === "retry" && putOk) {
        setMsg({ tone: "warn", text: t(L, "product.queued") });
        reset();
      } else if (r === "retry") {
        setMsg({ tone: "err", text: t(L, "product.error.offlineNoStore") });
      } else {
        setMsg({ tone: "err", text: t(L, entry.lastError ?? "common.error") });
      }
    });

  return (
    <form className="space-y-6 pb-28" onSubmit={(e) => { e.preventDefault(); if (ready) save(); }} lang={L}>
      {itemLabel && <p className="border-l-2 border-signature pl-3 text-body text-ink-2">{itemLabel}</p>}
      {rejected.map((e) => (
        <div key={e.productId} className="flex items-center justify-between gap-2 bg-crit-soft px-3 py-2 text-meta text-crit">
          <span>{t(L, "product.queue.rejected", { error: t(L, e.lastError ?? "common.error") })}</span>
          <button type="button" className="shrink-0 underline" onClick={() => removeEntry(e.productId).then(refreshCount)}>{t(L, "product.queue.discard")}</button>
        </div>
      ))}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between bg-warn-soft px-3 py-2 text-body text-warn">
          <span>{t(L, "product.queue.pending", { n: pendingCount })}</span>
          <button type="button" className="underline" onClick={flush}>{t(L, "product.queue.retry")}</button>
        </div>
      )}

      <section>
        <div className="grid grid-cols-4 gap-2">
          {shots.map((s, i) => (
            <div key={s.preview} className="relative aspect-[3/4] bg-sand">
              {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기(blob URL) */}
              <img src={s.preview} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label={t(L, "common.remove")} onClick={() => setShots((x) => x.filter((_, k) => k !== i))} className="absolute right-0.5 top-0.5 bg-ink/70 px-1.5 text-meta text-paper">×</button>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
          <button type="button" onClick={() => camera.current?.click()} className={`${big} bg-ink text-paper`}>{t(L, "product.photo.take")}</button>
          <button type="button" onClick={() => album.current?.click()} className={`${big} border border-ink`}>{t(L, "product.photo.pick")}</button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addShots(e.target.files, true); e.target.value = ""; }} />
        <input ref={album} type="file" accept="image/*" multiple hidden onChange={(e) => { addShots(e.target.files, false); e.target.value = ""; }} />
        {shots.length > 0 && (
          <p className={`mt-1.5 text-meta ${shots.some((s) => s.camera) ? "text-signature" : "text-muted"}`}>
            {t(L, shots.some((s) => s.camera) ? "product.photo.verified" : "product.photo.notVerified")}
          </p>
        )}
      </section>

      <section className="space-y-2">
        {tiers.map((tier, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-3">
            <label className="text-meta text-ink-2">{t(L, "product.cost.qty")}
              <input className={`${field} num`} inputMode="numeric" value={tier.qty} onChange={(e) => setTiers((x) => x.map((y, k) => (k === i ? { ...y, qty: e.target.value.replace(/\D/g, "") } : y)))} />
            </label>
            <label className="text-meta text-ink-2">{tFor(vendorLocked)(L, "product.cost")}
              <input className={`${field} num text-h1-s font-semibold`} inputMode="decimal" value={tier.cost} onChange={(e) => setTiers((x) => x.map((y, k) => (k === i ? { ...y, cost: e.target.value.replace(/[^\d.]/g, "") } : y)))} />
            </label>
            {i > 0 ? <button type="button" className="pb-2 text-meta text-muted" onClick={() => setTiers((x) => x.filter((_, k) => k !== i))}>{t(L, "product.cost.remove")}</button> : <span />}
          </div>
        ))}
        {tiers.length < 6 && <button type="button" className="text-body text-signature" onClick={() => setTiers((x) => [...x, { qty: "", cost: "" }])}>{t(L, "product.cost.addTier")}</button>}
      </section>

      {!vendorLocked && (
      <section className="space-y-2">
        <div className="text-meta font-semibold text-ink-2">{t(L, "product.vendor")}{vendors.length > 0 && ` · ${t(L, "product.vendor.recent")}`}</div>
        <div className="flex flex-wrap gap-2">
          {vendors.map((v) => (
            <button key={v.id} type="button" onClick={() => { setVendorId(v.id); setNewVendor(null); setSampleOk(v.default_sample_ok); }}
              className={`border px-3 py-2 text-lead ${!newVendor && vendorId === v.id ? "border-ink bg-ink text-paper" : "border-line bg-surface"}`}>
              {v.name}{v.booth ? ` · ${v.booth}` : ""}
            </button>
          ))}
          <button type="button" onClick={() => setNewVendor(newVendor ?? { name: "", market: "", booth: "", wechat: "" })} className={`border px-3 py-2 text-lead ${newVendor ? "border-ink" : "border-dashed border-ink-2/50"}`}>
            {t(L, "product.vendor.new")}
          </button>
        </div>
        {newVendor && (
          <div className="grid grid-cols-2 gap-3 bg-surface p-3">
            <input aria-label={t(L, "product.vendor.name")} className={`${field} col-span-2`} placeholder={t(L, "product.vendor.name")} value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} />
            <input aria-label={t(L, "product.vendor.market")} className={field} placeholder={t(L, "product.vendor.market")} value={newVendor.market} onChange={(e) => setNewVendor({ ...newVendor, market: e.target.value })} />
            <input aria-label={t(L, "product.vendor.booth")} className={field} placeholder={t(L, "product.vendor.booth")} value={newVendor.booth} onChange={(e) => setNewVendor({ ...newVendor, booth: e.target.value })} />
            <input aria-label={t(L, "product.vendor.wechat")} className={field} placeholder={t(L, "product.vendor.wechat")} value={newVendor.wechat} onChange={(e) => setNewVendor({ ...newVendor, wechat: e.target.value })} />
            <button type="button" onClick={() => card.current?.click()} className="border border-line py-2 text-body">{cardBlob ? "✔ " : ""}{t(L, "product.vendor.card")}</button>
            <input ref={card} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCardBlob(await resizeToWebp(f)); e.target.value = ""; }} />
          </div>
        )}
      </section>
      )}

      <section className="space-y-3">
        <input aria-label={t(L, "product.name")} className={field} placeholder={t(L, "product.name")} value={nameZh} maxLength={100} onChange={(e) => setNameZh(e.target.value)} />
        <input aria-label={t(L, "product.memo")} className={field} placeholder={t(L, "product.memo")} value={memoZh} maxLength={500} onChange={(e) => setMemoZh(e.target.value)} />
        <label className="flex items-center gap-2 text-lead">
          <input type="checkbox" className="h-5 w-5" checked={sampleOk} onChange={(e) => setSampleOk(e.target.checked)} /> {t(L, "product.sampleOk")}
        </label>
      </section>

      {msg && (
        <p className={`text-body ${msg.tone === "ok" ? "text-signature" : msg.tone === "warn" ? "text-warn" : "text-crit"}`}>
          {msg.text} {msg.href && <Link href={msg.href} className="underline">{t(L, "product.openDetail")}</Link>}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <button disabled={!ready || busy} className={`${big} bg-signature text-paper disabled:opacity-40`}>{busy ? t(L, "product.saving") : t(L, "product.save")}</button>
      </div>
    </form>
  );
}
