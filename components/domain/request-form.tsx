"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { ImagePicker, type PickedImage } from "./image-picker";
import { QTY_RANGES } from "@/lib/codes";

type Draft = { key: number; description: string; category: string; targetPrice: string; qty: string; images: PickedImage[]; links: string };
const empty = (key: number): Draft => ({ key, description: "", category: "", targetPrice: "", qty: "", images: [], links: "" });

const label = "block text-meta font-medium text-ink-2";
const field = "mt-1 w-full border-0 border-b border-line bg-transparent px-0 py-2 text-strong outline-none focus:border-ink";

/**
 * B-02 요청 (모바일 우선). 필수: 항목마다 사진/링크 1개 이상 + 한 줄 설명. 나머지는 선택.
 * submit 으로 서버 액션(브랜드 createRequest / 관리자 createRequestOnBehalf)을 고른다.
 */
export function RequestForm({
  brandId,
  categories,
  doneHrefPrefix,
  submit,
  minLeadDays = 14,
}: {
  brandId: string;
  categories: string[];
  /** 생성 후 이동: `${doneHrefPrefix}${requestId}` */
  doneHrefPrefix: string;
  /** 희망 납기가 오늘 + 이 값보다 빠르면 경고만 (settings.min_lead_days, COWORK_DECISIONS Q3) */
  minLeadDays?: number;
  submit: (brandId: string, input: unknown) => Promise<{ ok: true; data: { requestId: string } } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [items, setItems] = useState<Draft[]>([empty(1)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (key: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const links = (s: string) => s.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const ready = items.every((it) => it.description.trim() && (it.images.length || links(it.links).length));

  const onSubmit = () =>
    start(async () => {
      setError(null);
      const res = await submit(brandId, {
        title, memo, targetDate,
        items: items.map((it) => ({
          description: it.description, category: it.category, expectedQtyRange: it.qty,
          targetPriceKrw: it.targetPrice ? Number(it.targetPrice.replace(/[^\d]/g, "")) : null,
          imagePaths: it.images.map((i) => i.path), links: links(it.links),
        })),
      });
      if (!res.ok) return setError(tk(res.error));
      router.push(`${doneHrefPrefix}${res.data.requestId}`);
    });

  return (
    <form className="space-y-10" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {items.map((it, idx) => (
        <fieldset key={it.key} className="space-y-5 border-t border-ink pt-4">
          <div className="flex items-baseline justify-between">
            <legend className="num text-body font-semibold">{tk("request.item", { n: String(idx + 1).padStart(2, "0") })}</legend>
            {items.length > 1 && (
              <button type="button" className="text-meta text-muted underline-offset-4 hover:underline" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}>{tk("request.removeItem")}</button>
            )}
          </div>
          <ImagePicker brandId={brandId} value={it.images} onChange={(images) => set(it.key, { images })} />
          <label className={label}>{tk("request.field.links")}
            <input className={field} inputMode="url" placeholder={tk("request.field.links.ph")} value={it.links} onChange={(e) => set(it.key, { links: e.target.value })} />
          </label>
          <label className={label}>{tk("request.field.description")} *
            <input className={field} required maxLength={200} placeholder={tk("request.field.description.ph")} value={it.description} onChange={(e) => set(it.key, { description: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <label className={label}>{tk("request.field.category")}
              <select className={field} value={it.category} onChange={(e) => set(it.key, { category: e.target.value })}>
                <option value="">-</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className={label}>{tk("request.field.qty")}
              <select className={field} value={it.qty} onChange={(e) => set(it.key, { qty: e.target.value })}>
                <option value="">-</option>
                {QTY_RANGES.map((q) => <option key={q} value={q}>{tk(`qtyRange.${q}`)}</option>)}
              </select>
            </label>
            <label className={`${label} col-span-2 sm:col-span-1`}>{tk("request.field.targetPrice")}
              <input className={`${field} num`} inputMode="numeric" value={it.targetPrice} onChange={(e) => set(it.key, { targetPrice: e.target.value.replace(/[^\d]/g, "") })} />
              <span className="mt-1 block text-caption font-normal text-muted">{tk("request.field.targetPrice.help")}</span>
            </label>
          </div>
        </fieldset>
      ))}

      <button type="button" className="w-full border border-dashed border-ink-2/40 py-3 text-body text-ink-2 hover:border-ink" onClick={() => setItems((xs) => [...xs, empty(Math.max(...xs.map((x) => x.key)) + 1)])}>
        {tk("request.addItem")}
      </button>

      <fieldset className="space-y-5 border-t border-line pt-4">
        <label className={label}>{tk("request.field.title")}
          <input className={field} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={label}>{tk("request.field.memo")}
          <textarea className={`${field} min-h-20`} maxLength={2000} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <label className={label}>{tk("request.field.targetDate")}
          <input className={`${field} num`} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          {targetDate && new Date(`${targetDate}T23:59:59`) < new Date(Date.now() + minLeadDays * 86400000) && (
            <span className="mt-1 block text-caption font-normal text-warn">{tk("request.warn.targetDateTooSoon", { n: minLeadDays })}</span>
          )}
        </label>
      </fieldset>

      {!ready && <p className="text-meta text-muted">{tk("request.error.needImageOrLink")}</p>}
      {error && <p className="text-body text-crit">{error}</p>}
      <div className="sticky bottom-0 -mx-5 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur">
        <button disabled={!ready || pending} className="w-full bg-ink py-3.5 text-strong font-semibold text-paper disabled:opacity-40">
          {pending ? tk("request.submitting") : tk("request.submit")}
        </button>
      </div>
    </form>
  );
}
