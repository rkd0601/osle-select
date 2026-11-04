"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { ImagePicker, type PickedImage } from "./image-picker";
import { QTY_RANGES } from "@/lib/codes";

type Draft = { key: number; description: string; category: string; targetPrice: string; qty: string; images: PickedImage[]; links: string };
const empty = (key: number): Draft => ({ key, description: "", category: "", targetPrice: "", qty: "", images: [], links: "" });

/**
 * B-02 요청 (디자인 v2 §5): 항목마다 사진 자리 200px 3:4 왼쪽 + 밑줄 입력 오른쪽 → "+ 항목 추가"(보조) → 요청 정보 → 바닥 줄(요약 + "요청 올리기" 52px).
 * 필수: 항목마다 사진/링크 1개 이상 + 한 줄 설명. 나머지는 선택. 모바일은 한 칸으로 쌓인다(.reqgrid).
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
  const uid = useId();
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [items, setItems] = useState<Draft[]>([empty(1)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (key: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const links = (s: string) => s.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const ready = items.every((it) => it.description.trim() && (it.images.length || links(it.links).length));
  const photoCount = items.reduce((n, it) => n + it.images.length, 0);
  const linkCount = items.reduce((n, it) => n + links(it.links).length, 0);
  const id = (k: number, f: string) => `${uid}-${k}-${f}`;

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
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {items.map((it, idx) => (
        <section key={it.key} className="section" style={idx === 0 ? { paddingTop: 8 } : undefined} aria-labelledby={id(it.key, "h")}>
          <div className="section-h">
            <h2 id={id(it.key, "h")}>{tk("request.itemLabel")}<span className="num ml-1.5 font-light">{String(idx + 1).padStart(2, "0")}</span></h2>
            {items.length > 1 && (
              <button type="button" className="min-h-9 text-meta text-ink-2 hover:text-crit" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}>{tk("request.removeItem")}</button>
            )}
          </div>
          <div className="reqgrid grid grid-cols-[200px_minmax(0,1fr)] gap-10 pt-7">
            <div className="w-full max-w-[200px]">
              <ImagePicker brandId={brandId} value={it.images} onChange={(images) => set(it.key, { images })} layout="stack" addLabel={tk("request.photo.add")} addHint={tk("request.photo.orLink")} />
            </div>
            <div className="flex min-w-0 flex-col gap-7">
              <div className="field">
                <label htmlFor={id(it.key, "links")}>{tk("request.field.links")}</label>
                <input id={id(it.key, "links")} inputMode="url" placeholder={tk("request.field.links.ph")} value={it.links} onChange={(e) => set(it.key, { links: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={id(it.key, "desc")}>{tk("request.field.description")} *</label>
                <input id={id(it.key, "desc")} required maxLength={200} placeholder={tk("request.field.description.ph")} value={it.description} onChange={(e) => set(it.key, { description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-7">
                <div className="field">
                  <label htmlFor={id(it.key, "cat")}>{tk("request.field.category")}</label>
                  <select id={id(it.key, "cat")} value={it.category} onChange={(e) => set(it.key, { category: e.target.value })}>
                    <option value="">-</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={id(it.key, "qty")}>{tk("request.field.qty")}</label>
                  <select id={id(it.key, "qty")} value={it.qty} onChange={(e) => set(it.key, { qty: e.target.value })}>
                    <option value="">-</option>
                    {QTY_RANGES.map((q) => <option key={q} value={q}>{tk(`qtyRange.${q}`)}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor={id(it.key, "price")}>{tk("request.field.targetPrice")}</label>
                <input id={id(it.key, "price")} className="num" inputMode="numeric" value={it.targetPrice} onChange={(e) => set(it.key, { targetPrice: e.target.value.replace(/[^\d]/g, "") })} />
                <span className="hint">{tk("request.field.targetPrice.help")}</span>
              </div>
            </div>
          </div>
        </section>
      ))}

      <div className="pt-7">
        <button type="button" className="btn sec" onClick={() => setItems((xs) => [...xs, empty(Math.max(...xs.map((x) => x.key)) + 1)])}>
          {tk("request.addItem")}
        </button>
      </div>

      <section className="section" aria-labelledby={`${uid}-info`}>
        <div className="section-h"><h2 id={`${uid}-info`}>{tk("request.step.info")}</h2></div>
        <div className="flex max-w-[520px] flex-col gap-7 pt-7">
          <div className="field">
            <label htmlFor={`${uid}-title`}>{tk("request.field.title")}</label>
            <input id={`${uid}-title`} maxLength={80} placeholder={tk("request.field.title.ph")} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-date`}>{tk("request.field.targetDate")}</label>
            <input id={`${uid}-date`} className="num" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            {targetDate && new Date(`${targetDate}T23:59:59`) < new Date(Date.now() + minLeadDays * 86400000)
              ? <span className="hint text-warn">{tk("request.warn.targetDateTooSoon", { n: minLeadDays })}</span>
              : <span className="hint">{tk("request.field.targetDate.help", { n: minLeadDays })}</span>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-memo`}>{tk("request.field.memo")}</label>
            <textarea id={`${uid}-memo`} maxLength={2000} placeholder={tk("request.field.memo.ph")} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-ink bg-paper py-5">
        <div className="min-w-0">
          <span className="num meta">{tk("request.summary", { items: items.length, photos: photoCount, links: linkCount })}</span>
          {!ready && <p className="mt-1 text-caption text-muted">{tk("request.error.needImageOrLink")}</p>}
          {error && <p className="mt-1 text-meta text-crit">{error}</p>}
        </div>
        <button disabled={!ready || pending} className="btn lg max-sm:w-full">
          {pending ? tk("request.submitting") : tk("request.submit")}
        </button>
      </div>
    </form>
  );
}
