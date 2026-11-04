"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { addGlossaryTerm, approveProduct, draftProductTranslation, hideProduct, rejectProduct, saveProductKo } from "../actions";

type Check = { similarity: number; uncertain: boolean; back: string; glossaryMisses: string[] };
type Meta = { fields?: Record<string, Check> } | null;
const input = "field";

/** 원문(zh) | 번역(ko, 편집) — 역번역 차이·사전 위반 필드만 하이라이트. 관리자는 하이라이트만 본다 (기획서 F4) */
function Row({ label, zh, value, onChange, check, multiline }: { label: string; zh: string | null; value: string; onChange: (v: string) => void; check?: Check; multiline?: boolean }) {
  const warn = check?.uncertain;
  return (
    <div className={`grid gap-x-8 gap-y-3 border-b py-4 lg:grid-cols-2 ${warn ? "border-b-warn" : "border-line"}`}>
      <div lang="zh-CN">
        <div className="label">{label} · {tk("review.col.zh")}</div>
        <p className="mt-1.5 whitespace-pre-wrap text-body">{zh || "-"}</p>
      </div>
      <div>
        <div className="label flex justify-between">
          <span>{label} · {tk("review.col.ko")}</span>
          {check && <span className={`num ${warn ? "text-warn" : ""}`}>{tk("review.similarity", { n: Math.round(check.similarity * 100) })}</span>}
        </div>
        {multiline ? <textarea className={`${input} mt-0.5`} aria-label={`${label} · ${tk("review.col.ko")}`} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className={`${input} mt-0.5`} aria-label={`${label} · ${tk("review.col.ko")}`} value={value} onChange={(e) => onChange(e.target.value)} />}
        {warn && (
          <p className="mt-1 text-caption text-warn">
            {tk("review.back")}: <span lang="zh-CN">{check.back}</span>
            {check.glossaryMisses.length > 0 && ` · ${tk("review.glossaryMiss")}: ${check.glossaryMisses.join(", ")}`}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReviewPanel(props: {
  productId: string;
  status: string;
  zh: { name: string | null; desc: string | null; quality: string | null };
  ko: { name: string | null; desc: string | null; quality: string | null; show: boolean };
  colors: { id: string; name_zh: string | null; name_ko: string | null }[];
  meta: Meta;
  checksOk: boolean;
  templates: { code: string; ko: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta>(props.meta);
  const [f, setF] = useState({ name: props.ko.name ?? "", desc: props.ko.desc ?? "", quality: props.ko.quality ?? "", show: props.ko.show });
  const [colors, setColors] = useState(props.colors.map((c) => ({ id: c.id, nameKo: c.name_ko ?? "" })));
  const [codes, setCodes] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [term, setTerm] = useState({ zh: "", ko: "" });
  const m = meta?.fields ?? {};
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok = "common.saved") =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(tk(r.ok ? ok : (r.error ?? "common.error")));
      if (r.ok) router.refresh();
    });
  const save = () => saveProductKo(props.productId, { nameKo: f.name, descKo: f.desc, qualityNoteKo: f.quality, showQualityNote: f.show, colors });
  const canDecide = props.status === "pending_review" || props.status === "recheck";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn sec sm" disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const r = await draftProductTranslation(props.productId);
          if (!r.ok) return setMsg(tk(r.error));
          setF((x) => ({ ...x, name: x.name || r.data.nameKo, desc: x.desc || r.data.descKo, quality: x.quality || r.data.qualityNoteKo }));
          setColors((cs) => cs.map((c) => ({ ...c, nameKo: c.nameKo || r.data.colors.find((d) => d.id === c.id)?.nameKo || "" })));
          setMeta(r.data.meta as Meta);
        })}>{tk("review.translate")}</button>
        <span className="text-caption text-muted">{tk("review.translate.help")}</span>
      </div>

      <div className="-mt-2">
      <Row label={tk("review.field.name")} zh={props.zh.name} value={f.name} onChange={(v) => setF({ ...f, name: v })} check={m.name} />
      <Row label={tk("review.field.desc")} zh={props.zh.desc} value={f.desc} onChange={(v) => setF({ ...f, desc: v })} check={m.desc} multiline />
      <Row label={tk("review.field.quality")} zh={props.zh.quality} value={f.quality} onChange={(v) => setF({ ...f, quality: v })} check={m.qualityNote} multiline />
      <label className="flex items-center gap-2 py-3 text-body"><input type="checkbox" checked={f.show} onChange={(e) => setF({ ...f, show: e.target.checked })} />{tk("review.showQuality")}</label>
      {props.colors.map((c, i) => (
        <Row key={c.id} label={tk("product.detail.color")} zh={c.name_zh} value={colors[i].nameKo} onChange={(v) => setColors(colors.map((x, k) => (k === i ? { ...x, nameKo: v } : x)))} check={m[`color:${c.id}`]} />
      ))}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn sm" disabled={pending} onClick={() => run(save)}>{tk("common.save")}</button>
        {msg && <span className="text-meta text-ink-2">{msg}</span>}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-5 text-meta">
        <span className="pb-3 font-medium">{tk("review.glossary")}</span>
        <input aria-label={tk("review.glossary.zhPlaceholder")} className={`${input} w-32`} lang="zh-CN" placeholder={tk("review.glossary.zhPlaceholder")} value={term.zh} onChange={(e) => setTerm({ ...term, zh: e.target.value })} />
        <input aria-label={tk("admin.request.ko")} className={`${input} w-32`} placeholder={tk("admin.request.ko")} value={term.ko} onChange={(e) => setTerm({ ...term, ko: e.target.value })} />
        <button className="btn sec sm" disabled={pending || !term.zh || !term.ko} onClick={() => run(() => addGlossaryTerm(term).then((r) => { if (r.ok) setTerm({ zh: "", ko: "" }); return r; }))}>{tk("product.detail.add")}</button>
      </div>

      {canDecide && (
        <div className="space-y-6 border-t border-ink pt-6">
          <button
            className="btn lg w-full"
            disabled={pending || !props.checksOk || !f.name.trim()}
            onClick={() => run(async () => { const s = await save(); return s.ok ? approveProduct(props.productId) : s; }, "review.approved")}
          >
            {tk(props.status === "recheck" ? "review.reapprove" : "review.approve")}
          </button>
          {props.status === "pending_review" && (
            <div className="space-y-3 border-t border-line pt-5">
              <div className="text-meta font-medium">{tk("review.reject")}</div>
              <div className="flex flex-wrap gap-1.5">
                {props.templates.map((t) => (
                  <button key={t.code} type="button" onClick={() => setCodes(codes.includes(t.code) ? codes.filter((c) => c !== t.code) : [...codes, t.code])}
                    aria-pressed={codes.includes(t.code)} className="chip">{t.ko}</button>
                ))}
              </div>
              <input aria-label={tk("admin.request.needsInfo.note")} className={input} placeholder={tk("admin.request.needsInfo.note")} value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} />
              <button className="btn sec sm" disabled={pending || !codes.length} onClick={() => run(() => rejectProduct(props.productId, { codes, memo }), "review.rejected")}>{tk("review.reject.submit")}</button>
            </div>
          )}
        </div>
      )}
      {["reviewed", "repool", "offering", "rejected", "recheck"].includes(props.status) && (
        <button className="text-meta text-ink-2 underline underline-offset-4 hover:text-crit" disabled={pending} onClick={() => window.confirm(tk("review.hide.confirm")) && run(() => hideProduct(props.productId))}>{tk("review.hide")}</button>
      )}
    </div>
  );
}
