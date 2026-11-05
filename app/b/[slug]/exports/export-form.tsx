"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { Photo } from "@/components/domain/photo";
import { createExportPackage } from "./actions";

type Cand = { productId: string; code: string; name: string; order: boolean; sample: boolean; photoCount: number; cover: string | null };
const PRESETS = ["cafe24", "godo", "imweb", "smartstore"] as const;
const SOURCES = ["all", "order", "sample"] as const;

/**
 * B-12 패키지 만들기. 출처 칩(전체·발주 확정·샘플 채택)은 화면 안 거르기 — 선택은 유지된다.
 * 디자인 v2.2: 청구 화면 "쇼핑몰용 상품 파일"(#packages) 안. 후보는 1px 룰 사이 행(사진 3:4 · 이름 · 출처 한 줄), 상품 코드 없음(d-11).
 * 체크박스는 행 맨 앞 — 여러 상품을 한 패키지로 고르는 입력이라 남긴다(E2E B-12가 `ul input[type=checkbox]`로 고른다).
 */
export function ExportForm({ brandId, candidates }: { brandId: string; candidates: Cand[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [presets, setPresets] = useState<(typeof PRESETS)[number][]>([]);
  const [src, setSrc] = useState<(typeof SOURCES)[number]>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!candidates.length) return <div className="empty"><p className="t">{tk("export.empty")}</p></div>;
  const shown = candidates.filter((c) => src === "all" || c[src]);
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.includes(c.productId));
  const count = (k: (typeof SOURCES)[number]) => candidates.filter((c) => k === "all" || c[k]).length;
  return (
    <section>
      <div className="section-h">
        <div className="flex flex-wrap gap-2" role="group" aria-label={tk("export.filter")}>
          {SOURCES.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={src === k} onClick={() => setSrc(k)}>
              {tk(`export.filter.${k}`)}<span className="count">{count(k)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="min-h-9 shrink-0 text-meta text-ink-2 hover:text-ink"
          onClick={() => setPicked(allShownPicked ? picked.filter((id) => !shown.some((c) => c.productId === id)) : [...new Set([...picked, ...shown.map((c) => c.productId)])])}>
          {tk(allShownPicked ? "export.unselectAll" : "export.selectAll")}
        </button>
      </div>
      <ul className="grid sm:grid-cols-2 sm:gap-x-6">
        {shown.map((c) => {
          const on = picked.includes(c.productId);
          return (
            <li key={c.productId} className="border-b border-line">
              <label className={`grid cursor-pointer grid-cols-[56px_1fr_auto] items-start gap-x-4 py-4 transition-colors sm:grid-cols-6 sm:gap-x-6 ${on ? "" : "hover:bg-[linear-gradient(90deg,var(--surface),transparent)]"}`}>
                {/* 6칸 소그리드: 사진 1칸 · 글 4칸(둘째 선) · 선택 1칸 — 샘플·발주 작성과 같은 순서(L4) */}
                <span className="sm:col-span-1"><Photo src={c.cover} alt={c.name} /></span>
                <span className="min-w-0 text-body sm:col-span-4">
                  <span className={`block text-lead ${on ? "font-medium text-ink" : "text-ink"}`}>{c.name}</span>
                  <span className="mt-1 block text-meta text-ink-2">{[c.order && tk("export.src.order"), c.sample && tk("export.src.sample")].filter(Boolean).join(" · ")}</span>
                  <span className={`num mt-1 block text-caption ${c.photoCount ? "text-muted" : "text-warn"}`}>{c.photoCount ? tk("export.photos", { n: c.photoCount }) : tk("export.noPhotos")}</span>
                </span>
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--ink)] sm:col-span-1" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.productId] : picked.filter((x) => x !== c.productId))} />
              </label>
            </li>
          );
        })}
      </ul>
      <div className="section">
        <div className="section-h"><h2>{tk("export.standard")}</h2></div>
        <p className="mt-3 text-meta text-ink-2">{tk("export.standardHelp")}</p>
        <fieldset className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-6">
          <legend className="label mb-2">{tk("export.presets")}</legend>
          {PRESETS.map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-2 text-body">
              <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={presets.includes(s)} onChange={(e) => setPresets(e.target.checked ? [...presets, s] : presets.filter((x) => x !== s))} />
              {tk(`export.shop.${s}`)} <span className="text-caption text-muted">{tk("export.draft")}</span>
            </label>
          ))}
        </fieldset>
      </div>
      {/* 아래 바: 12칸 소그리드 — 버튼 3칸(글이 길어도 칸 선에서 끝난다) · 안내 9칸. 종이색 불투명 + 윗 잉크 룰 */}
      <div className="sticky bottom-0 z-10 mt-8 grid grid-cols-12 items-center gap-x-6 gap-y-3 border-t border-ink bg-paper py-4">
        <button className="btn lg col-span-12 w-full sm:col-span-4 lg:col-span-3" disabled={pending || !picked.length || picked.length > 30}
          onClick={() => start(async () => {
            setMsg(null); setNote(null);
            const r = await createExportPackage(brandId, { productIds: picked, presets });
            if (!r.ok) return setMsg(tk(r.error));
            setPicked([]);
            if (r.data.missingPhotos > 0) setNote(tk("export.missingPhotos", { n: r.data.missingPhotos }));
            router.refresh();
          })}>{pending ? tk("export.building") : tk("export.create", { n: picked.length })}</button>
        {msg && <span className="col-span-12 text-meta text-crit sm:col-span-8 lg:col-span-9">{msg}</span>}
        {note && <span className="col-span-12 text-meta text-warn sm:col-span-8 lg:col-span-9">{note}</span>}
      </div>
    </section>
  );
}
