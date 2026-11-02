"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { fromInput, toInput, validNumeric, type NumericSettingDef } from "@/lib/settings-schema";
import { updateListSetting, updateNumericSetting } from "./actions";

type R = { ok: true; data?: unknown } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<R>, okText?: (r: R & { ok: true }) => string) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok) return setMsg({ ok: false, text: tk(r.error) });
    setMsg({ ok: true, text: okText?.(r) ?? tk("settings.saved") });
    router.refresh();
  });
  return { pending, msg, run };
}
const field = "border-0 border-b border-line bg-transparent py-1.5 text-body outline-none";
const btn = "bg-ink px-3 py-1.5 text-meta font-medium text-paper disabled:opacity-40";
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? <span className={`text-meta ${m.ok ? "text-signature" : "text-crit"}`}>{m.text}</span> : null);

export function NumericSettingRow({ def, value }: { def: NumericSettingDef; value: number }) {
  const { pending, msg, run } = useRun();
  const [s, setS] = useState(String(toInput(def, value)));
  const next = fromInput(def, s);
  const ok = s.trim() !== "" && validNumeric(def, next);
  const dirty = ok && next !== value;
  const unit = tk(`settings.unit.${def.unit}`);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5 text-body">
      <span className="w-56">{tk(`settings.key.${def.key}`)}</span>
      <input className={`${field} num w-28 text-right`} inputMode="decimal" value={s} onChange={(e) => setS(e.target.value)} aria-label={tk(`settings.key.${def.key}`)} />
      <span className="w-10 text-meta text-muted">{unit}</span>
      <button className={btn} disabled={pending || !dirty}
        onClick={() => {
          if (def.key === "fx_rate_cny_krw" && !window.confirm(tk("settings.fxAsk"))) return;
          run(() => updateNumericSetting(def.key, next), (r) => {
            const fx = (r.data as { fx?: { products: number; scanned: number; capped: boolean } } | undefined)?.fx;
            if (!fx) return tk("settings.saved");
            return tk("settings.fxDone", { n: fx.products, scanned: fx.scanned }) + (fx.capped ? ` ${tk("settings.fxCapped")}` : "");
          });
        }}>{tk("common.save")}</button>
      {!ok && s.trim() !== "" && <span className="text-meta text-crit">{tk("settings.rangeHint", { min: toInput(def, def.min), max: toInput(def, def.max), unit })}</span>}
      <Msg m={msg} />
    </li>
  );
}

export function CategoriesEditor({ value }: { value: string[] }) {
  const { pending, msg, run } = useRun();
  const [s, setS] = useState(value.join("\n"));
  const list = s.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-body">
      <textarea className="h-40 w-64 border border-line bg-transparent p-2 text-body" value={s} onChange={(e) => setS(e.target.value)} aria-label={tk("settings.list.categories")} />
      <p className="text-meta text-ink-2">{tk("settings.categoriesHelp")}</p>
      <div className="flex items-center gap-3">
        <button className={btn} disabled={pending || !list.length} onClick={() => run(() => updateListSetting("categories", list))}>{tk("common.save")}</button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

type Tpl = { code: string; ko: string; zh: string };
export function RejectionTemplatesEditor({ value }: { value: Tpl[] }) {
  const { pending, msg, run } = useRun();
  const [rows, setRows] = useState<Tpl[]>(value);
  const set = (i: number, k: keyof Tpl, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-2 text-body">
      <table className="w-full max-w-2xl text-left">
        <thead className="text-caption text-muted"><tr><th className="py-1 font-normal">{tk("settings.tpl.code")}</th><th className="font-normal">{tk("settings.tpl.ko")}</th><th className="font-normal">{tk("settings.tpl.zh")}</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input className={`${field} num w-32`} value={r.code} onChange={(e) => set(i, "code", e.target.value.toLowerCase())} aria-label={tk("settings.tpl.code")} /></td>
              <td><input className={`${field} w-48`} value={r.ko} onChange={(e) => set(i, "ko", e.target.value)} aria-label={tk("settings.tpl.ko")} /></td>
              <td><input className={`${field} w-48`} value={r.zh} lang="zh-CN" onChange={(e) => set(i, "zh", e.target.value)} aria-label={tk("settings.tpl.zh")} /></td>
              <td><button className="text-meta text-muted" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{tk("common.remove")}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button className="border border-line px-3 py-1.5 text-meta" onClick={() => setRows([...rows, { code: "", ko: "", zh: "" }])}>{tk("settings.tpl.add")}</button>
        <button className={btn} disabled={pending} onClick={() => run(() => updateListSetting("rejection_templates", rows))}>{tk("common.save")}</button>
        <Msg m={msg} />
      </div>
      <p className="text-meta text-ink-2">{tk("settings.tplHelp")}</p>
    </div>
  );
}

type Bank = { bank: string; number: string; holder: string };
export function BankAccountEditor({ value }: { value: Bank | null }) {
  const { pending, msg, run } = useRun();
  const [b, setB] = useState<Bank>(value ?? { bank: "", number: "", holder: "" });
  return (
    <div className="space-y-2 text-body">
      <div className="flex flex-wrap gap-4">
        <label className="text-caption text-muted">{tk("settings.bank.bank")}<input className={`${field} block w-32`} value={b.bank} onChange={(e) => setB({ ...b, bank: e.target.value })} /></label>
        <label className="text-caption text-muted">{tk("settings.bank.number")}<input className={`${field} num block w-48`} inputMode="numeric" value={b.number} onChange={(e) => setB({ ...b, number: e.target.value })} /></label>
        <label className="text-caption text-muted">{tk("settings.bank.holder")}<input className={`${field} block w-40`} value={b.holder} onChange={(e) => setB({ ...b, holder: e.target.value })} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className={btn} disabled={pending || !b.bank || !b.number || !b.holder} onClick={() => window.confirm(tk("settings.bankAsk")) && run(() => updateListSetting("bank_account", b))}>{tk("common.save")}</button>
        {value && <button className="text-meta text-muted" disabled={pending} onClick={() => window.confirm(tk("settings.bankClearAsk")) && run(() => updateListSetting("bank_account", null))}>{tk("settings.bank.clear")}</button>}
        <Msg m={msg} />
      </div>
    </div>
  );
}
