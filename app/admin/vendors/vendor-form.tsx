"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { LabelRows, ModRows, type LabelRow, type ModRow } from "@/components/domain/option-rows";
import { saveVendor } from "./actions";

type Hold = { none: true } | { deposit_pct: number; days: number };
export type VendorRow = {
  id: string; name: string; market: string | null; booth: string | null; wechat: string | null; notes: string | null;
  default_hold: Hold; default_sample_ok: boolean; default_label_options: LabelRow[]; default_mod_options: ModRow[];
};
const input = "w-full border border-line bg-surface px-2 py-1.5 text-[13px]";

/** A-08 원청 생성·수정. 기본값은 상품이 상속(C-03에서 예외만 입력). */
export function VendorForm({ vendor, onDone }: { vendor: VendorRow | null; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ name: vendor?.name ?? "", market: vendor?.market ?? "", booth: vendor?.booth ?? "", wechat: vendor?.wechat ?? "", notes: vendor?.notes ?? "" });
  const [hold, setHold] = useState<Hold>(vendor?.default_hold ?? { none: true });
  const [sampleOk, setSampleOk] = useState(vendor?.default_sample_ok ?? true);
  const [labels, setLabels] = useState<LabelRow[]>(vendor?.default_label_options ?? []);
  const [mods, setMods] = useState<ModRow[]>(vendor?.default_mod_options ?? []);
  const types = ["main_label", "care_label", "hangtag", "polybag", "tag_attach"].map((code) => ({ code, label: tk(`product.option.labelType.${code}`) }));
  const rl = { item: tk("product.option.item"), moq: tk("product.option.moq"), cost: tk("product.option.cost"), lead: tk("product.option.lead"), add: tk("product.detail.add"), remove: "×" };

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveVendor(vendor?.id ?? null, { ...f, defaultHold: hold, defaultSampleOk: sampleOk, defaultLabelOptions: labels, defaultModOptions: mods });
      setMsg(tk(res.ok ? "common.saved" : res.error));
      if (res.ok) {
        router.refresh();
        onDone?.();
      }
    });

  return (
    <div className="space-y-4 bg-surface p-4 text-[13px]">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input className={input} placeholder={tk("product.vendor.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={input} placeholder={tk("product.vendor.market")} value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })} />
        <input className={input} placeholder={tk("product.vendor.booth")} value={f.booth} onChange={(e) => setF({ ...f, booth: e.target.value })} />
        <input className={input} placeholder={tk("product.vendor.wechat")} value={f.wechat} onChange={(e) => setF({ ...f, wechat: e.target.value })} />
      </div>
      <div className="text-[12px] font-semibold text-ink-2">{tk("admin.vendors.defaults")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{tk("product.detail.hold")}</span>
        <select className={`${input} w-auto`} value={"none" in hold ? "none" : "deposit"} onChange={(e) => setHold(e.target.value === "none" ? { none: true } : { deposit_pct: 0.3, days: 7 })}>
          <option value="none">{tk("product.detail.hold.none")}</option>
          <option value="deposit">{tk("product.detail.hold.deposit", { pct: "N", days: "M" })}</option>
        </select>
        {!("none" in hold) && (
          <>
            <input className={`${input} num w-16`} inputMode="numeric" value={Math.round(hold.deposit_pct * 100)} onChange={(e) => setHold({ ...hold, deposit_pct: Math.min(100, Number(e.target.value) || 0) / 100 })} />%
            <input className={`${input} num w-16`} inputMode="numeric" value={hold.days} onChange={(e) => setHold({ ...hold, days: Number(e.target.value) || 0 })} />d
          </>
        )}
        <label className="ml-4 flex items-center gap-1"><input type="checkbox" checked={sampleOk} onChange={(e) => setSampleOk(e.target.checked)} />{tk("product.sampleOk")}</label>
      </div>
      <div><div className="mb-1 text-[12px] text-ink-2">{tk("product.detail.labels")}</div><LabelRows rows={labels} onChange={setLabels} types={types} labels={rl} /></div>
      <div><div className="mb-1 text-[12px] text-ink-2">{tk("product.detail.mods")}</div><ModRows rows={mods} onChange={setMods} labels={rl} /></div>
      <textarea className={`${input} min-h-12`} placeholder={tk("admin.vendors.notes")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <div className="flex items-center gap-3">
        <button className="bg-ink px-3 py-1.5 text-[12px] text-paper disabled:opacity-40" disabled={pending || !f.name.trim()} onClick={save}>{tk("common.save")}</button>
        {msg && <span className="text-[12px] text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
