"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadToSignedUrl } from "@/lib/storage-upload";
import { photoErrorKey, shrinkPhoto } from "@/lib/images/resize";
import { BUCKETS } from "@/lib/config";
import { newUuid } from "@/lib/uuid";
import { t, tFor, type Locale } from "@/lib/i18n/cn";
import { flushAll, flushEntry, isRejected, listEntries, putEntry, removeEntry, type QueueEntry, type Uploader } from "@/lib/offline/queue";
import { createQuickProduct, issueProductImageUploads, issueVendorCardUpload, proxyCnImageUpload } from "../actions";
import { Seg } from "../seg";

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
      fd.set("file", new File([blob], "p.jpg", { type: "image/jpeg" }));
      return viaProxy(fd);
    },
    async uploadVendorCard(blob) {
      const issued = await issueVendorCardUpload();
      if (issued.ok) {
        if (await uploadToSignedUrl(BUCKETS.vendorCards, issued.data.path, issued.data.token, blob)) return issued.data.path;
      }
      const fd = new FormData();
      fd.set("kind", "vendor");
      fd.set("file", new File([blob], "v.jpg", { type: "image/jpeg" }));
      return viaProxy(fd);
    },
    create: (input) => createQuickProduct(input),
  };
}

const field = "field";
const lbl = "flex min-w-0 flex-col gap-1.5 text-caption text-muted";
const addLink = "inline-flex min-h-10 items-center text-meta text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

/**
 * C-02 상품 간단 등록 (모바일, 한 화면). 최소 세트: 사진 1장 + 원가 + 원청 (기획서 F2).
 * 저장은 먼저 IndexedDB에 넣고(유실 방지) 바로 전송을 시도한다. 실패하면 online 이벤트에 자동 재전송.
 * 저장되면 상품 상세로 **이동**한다(§0-l P3 — 폼을 비우고 머물면 저장이 안 된 것처럼 보여 같은 상품을 두 번 만들었다).
 * 사진은 고를 때 1600px JPEG로 줄이고, 못 여는 사진은 이유를 바로 보여 준다.
 * 디자인 v2: 단계 = 룰로 나눈 섹션(번호 · 제목 · 완료 점), 밑줄 입력, 바닥 고정 바(단계 점 + 52px 저장).
 */
export function QuickForm({ locale, actorId, vendors, vendorLocked = false, itemId, itemLabel }: { locale: Locale; actorId: string; vendors: Vendor[]; vendorLocked?: boolean; itemId: string | null; itemLabel: string | null }) {
  const L = locale;
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLInputElement>(null);
  const [productId, setProductId] = useState(() => newUuid());
  const [newVendorId, setNewVendorId] = useState(() => newUuid()); // 원청 멱등 생성용
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
  const [done, setDone] = useState(false); // 저장 → 상세로 이동 중 (두 번 누름 방지)

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
    setMsg(null);
    let blobs: Blob[];
    try {
      blobs = await Promise.all([...files].slice(0, 15 - shots.length).map((f) => shrinkPhoto(f)));
    } catch (e) {
      setMsg({ tone: "err", text: t(L, photoErrorKey(e)) });
      return;
    }
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
    setProductId(newUuid());
    if (newVendor) setNewVendorId(newUuid());
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
        setDone(true);
        router.push(`/cn/products/${productId}?saved=1`);
      } else if (r === "retry" && putOk) {
        setMsg({ tone: "warn", text: t(L, "product.queued") });
        reset();
      } else if (r === "retry") {
        setMsg({ tone: "err", text: t(L, "product.error.offlineNoStore") });
      } else {
        setMsg({ tone: "err", text: t(L, entry.lastError ?? "common.error") });
      }
    });

  const priceOk = tiers.every((x) => x.qty && x.cost);
  const steps: [string, boolean][] = [
    [t(L, "cn.new.step.photos"), shots.length > 0],
    [t(L, "cn.new.step.price"), priceOk],
    ...(!vendorLocked ? [[t(L, "product.vendor"), vendorOk] as [string, boolean]] : []),
  ];

  return (
    <form className="pb-40" onSubmit={(e) => { e.preventDefault(); if (ready) save(); }} lang={L}>
      {itemLabel && <p className="mb-6 border-l-2 border-ink pl-3 text-body text-ink">{itemLabel}</p>}
      {rejected.map((e) => (
        <div key={e.productId} className="mb-3 flex items-center justify-between gap-3 border-l-2 border-crit pl-3 text-meta text-crit">
          <span className="min-w-0">{t(L, "product.queue.rejected", { error: t(L, e.lastError ?? "common.error") })}</span>
          <button type="button" className="inline-flex min-h-10 shrink-0 items-center underline underline-offset-4" onClick={() => removeEntry(e.productId).then(refreshCount)}>{t(L, "product.queue.discard")}</button>
        </div>
      ))}
      {pendingCount > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 border-l-2 border-warn pl-3 text-meta text-warn">
          <span className="min-w-0">{t(L, "product.queue.pending", { n: pendingCount })}</span>
          <button type="button" className="inline-flex min-h-10 shrink-0 items-center underline underline-offset-4" onClick={flush}>{t(L, "product.queue.retry")}</button>
        </div>
      )}

      <Step n={1} title={t(L, "cn.new.step.photos")} done={shots.length > 0} aside={shots.length > 0 ? t(L, "cn.new.photoCount", { n: shots.length }) : null}>
        {shots.length > 0 && (
          <div className="mb-4 grid grid-cols-4 gap-2">
            {shots.map((s, i) => (
              <div key={s.preview} className="photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기(blob URL) */}
                <img src={s.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                {i === 0 && <span className="tag" style={{ left: 4, bottom: 4 }}>1</span>}
                <button type="button" aria-label={t(L, "common.remove")} onClick={() => setShots((x) => x.filter((_, k) => k !== i))} className="absolute right-0 top-0 inline-flex h-10 w-10 items-start justify-end p-1"><span className="inline-flex h-6 w-6 items-center justify-center bg-ink/75 text-meta text-paper" aria-hidden>×</span></button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <button type="button" onClick={() => camera.current?.click()} className="btn lg w-full">{t(L, "product.photo.take")}</button>
          <button type="button" onClick={() => album.current?.click()} className="btn sec lg w-full">{t(L, "product.photo.pick")}</button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addShots(e.target.files, true); e.target.value = ""; }} />
        <input ref={album} type="file" accept="image/*" multiple hidden onChange={(e) => { addShots(e.target.files, false); e.target.value = ""; }} />
        {shots.length > 0 && (
          <p className="mt-3"><span className={`st ${shots.some((s) => s.camera) ? "done" : "warn"}`}>
            {t(L, shots.some((s) => s.camera) ? "product.photo.verified" : "product.photo.notVerified")}
          </span></p>
        )}
      </Step>

      <Step n={2} title={t(L, "cn.new.step.price")} done={priceOk}>
        <div className="space-y-4">
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-end gap-4">
              <label className={lbl}>{t(L, "product.cost.qty")}
                <input className={`${field} num`} inputMode="numeric" value={tier.qty} onChange={(e) => setTiers((x) => x.map((y, k) => (k === i ? { ...y, qty: e.target.value.replace(/\D/g, "") } : y)))} />
              </label>
              <label className={lbl}>{tFor(vendorLocked)(L, "product.cost")}
                <input className={`${field} num text-h1-s font-light`} inputMode="decimal" value={tier.cost} onChange={(e) => setTiers((x) => x.map((y, k) => (k === i ? { ...y, cost: e.target.value.replace(/[^\d.]/g, "") } : y)))} />
              </label>
              {i > 0 ? <button type="button" className="inline-flex min-h-10 items-center px-1 text-meta text-ink-2 hover:text-crit" onClick={() => setTiers((x) => x.filter((_, k) => k !== i))}>{t(L, "product.cost.remove")}</button> : <span />}
            </div>
          ))}
          {tiers.length < 6 && <button type="button" className={addLink} onClick={() => setTiers((x) => [...x, { qty: "", cost: "" }])}>{t(L, "product.cost.addTier")}</button>}
        </div>
      </Step>

      {!vendorLocked && (
      <Step n={3} title={t(L, "product.vendor")} done={vendorOk} aside={vendors.length > 0 ? t(L, "product.vendor.recent") : null}>
        <div className="flex flex-wrap gap-2">
          {vendors.map((v) => (
            <button key={v.id} type="button" onClick={() => { setVendorId(v.id); setNewVendor(null); setSampleOk(v.default_sample_ok); }}
              aria-pressed={!newVendor && vendorId === v.id} className="chip min-h-11 text-body">
              {v.name}{v.booth ? ` · ${v.booth}` : ""}
            </button>
          ))}
          <button type="button" onClick={() => setNewVendor(newVendor ?? { name: "", market: "", booth: "", wechat: "" })} aria-pressed={!!newVendor}
            className="chip min-h-11 border-dashed text-body">
            {t(L, "product.vendor.new")}
          </button>
        </div>
        {newVendor && (
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
            <input aria-label={t(L, "product.vendor.name")} className={`${field} col-span-2`} placeholder={t(L, "product.vendor.name")} value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} />
            <input aria-label={t(L, "product.vendor.market")} className={field} placeholder={t(L, "product.vendor.market")} value={newVendor.market} onChange={(e) => setNewVendor({ ...newVendor, market: e.target.value })} />
            <input aria-label={t(L, "product.vendor.booth")} className={field} placeholder={t(L, "product.vendor.booth")} value={newVendor.booth} onChange={(e) => setNewVendor({ ...newVendor, booth: e.target.value })} />
            <input aria-label={t(L, "product.vendor.wechat")} className={field} placeholder={t(L, "product.vendor.wechat")} value={newVendor.wechat} onChange={(e) => setNewVendor({ ...newVendor, wechat: e.target.value })} />
            <button type="button" onClick={() => card.current?.click()} aria-pressed={!!cardBlob} className="btn sec self-end">
              {cardBlob ? <span className="st done">{t(L, "product.vendor.card")}</span> : t(L, "product.vendor.card")}
            </button>
            <input ref={card} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCardBlob(await shrinkPhoto(f).catch((err) => { setMsg({ tone: "err", text: t(L, photoErrorKey(err)) }); return null; })); e.target.value = ""; }} />
          </div>
        )}
      </Step>
      )}

      <Step n={vendorLocked ? 3 : 4} title={t(L, "cn.new.step.more")} optional>
        <div className="space-y-4">
          <input aria-label={t(L, "product.name")} className={field} placeholder={t(L, "product.name")} value={nameZh} maxLength={100} onChange={(e) => setNameZh(e.target.value)} />
          <input aria-label={t(L, "product.memo")} className={field} placeholder={t(L, "product.memo")} value={memoZh} maxLength={500} onChange={(e) => setMemoZh(e.target.value)} />
          <Seg label={t(L, "product.sampleOk")} value={sampleOk ? "yes" : "no"} onChange={(k) => setSampleOk(k === "yes")}
            options={[["yes", t(L, "product.sampleOk")], ["no", t(L, "cn.detail.noSample")]]} />
        </div>
      </Step>

      {msg && (
        <p role="status" className={`mt-8 border-l-2 pl-3 text-body ${msg.tone === "ok" ? "border-ok text-ink" : msg.tone === "warn" ? "border-warn text-warn" : "border-crit text-crit"}`}>
          {msg.text} {msg.href && <Link href={msg.href} className="link ml-2">{t(L, "product.openDetail")}</Link>}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[760px] px-5">
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1">
            {steps.map(([label, ok]) => (
              <li key={label} className={`st ${ok ? "done" : "wait"}`}>{label}</li>
            ))}
          </ul>
          <button disabled={!ready || busy || done} className="btn lg w-full">{busy ? t(L, "product.saving") : t(L, "product.save")}</button>
        </div>
      </div>
    </form>
  );
}

/** C-02 단계 섹션: 번호 · 제목 · 보조 문구 · 완료 점 (룰 위) */
function Step({ n, title, done = false, optional = false, aside, children }: { n: number; title: string; done?: boolean; optional?: boolean; aside?: string | null; children: React.ReactNode }) {
  return (
    <section className="section" style={{ paddingTop: 32 }}>
      <div className="section-h mb-5">
        <h2 className="flex items-baseline gap-3">
          <span className="num text-meta font-normal text-muted">{String(n).padStart(2, "0")}</span>
          {title}
          {!optional && done && <span className="st done" aria-hidden />}
        </h2>
        {aside && <span className="num text-meta text-ink-2">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
