"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { LabelRows, ModRows, type LabelRow, type ModRow } from "@/components/domain/option-rows";
import { saveVendor } from "./actions";
import { MOD_ITEMS } from "@/lib/codes";

type Hold = { none: true } | { deposit_pct: number; days: number };
export type VendorRow = {
  id: string; name: string; market: string | null; booth: string | null; wechat: string | null; notes: string | null;
  default_hold: Hold; default_sample_ok: boolean; owner_profile_id?: string | null; default_label_options: LabelRow[]; default_mod_options: ModRow[];
};
const input = "field py-1.5";

/** A-08 원청 생성·수정. 기본값은 상품이 상속(C-03에서 예외만 입력). */
export function VendorForm({ vendor, vendorUsers = [], onDone }: { vendor: VendorRow | null; vendorUsers?: { id: string; email: string | null }[]; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ name: vendor?.name ?? "", market: vendor?.market ?? "", booth: vendor?.booth ?? "", wechat: vendor?.wechat ?? "", notes: vendor?.notes ?? "" });
  const [hold, setHold] = useState<Hold>(vendor?.default_hold ?? { none: true });
  const [sampleOk, setSampleOk] = useState(vendor?.default_sample_ok ?? true);
  const [labels, setLabels] = useState<LabelRow[]>(vendor?.default_label_options ?? []);
  const [mods, setMods] = useState<ModRow[]>(vendor?.default_mod_options ?? []);
  const [owner, setOwner] = useState<string>(vendor?.owner_profile_id ?? "");
  const types = ["main_label", "care_label", "hangtag", "polybag", "tag_attach"].map((code) => ({ code, label: tk(`product.option.labelType.${code}`) }));
  const rl = { item: tk("product.option.item"), moq: tk("product.option.moq"), cost: tk("product.option.cost"), lead: tk("product.option.lead"), add: tk("product.detail.add"), remove: "×", removeLabel: tk("common.remove") };

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveVendor(vendor?.id ?? null, { ...f, defaultHold: hold, defaultSampleOk: sampleOk, defaultLabelOptions: labels, defaultModOptions: mods, ownerProfileId: owner || null });
      setMsg(tk(res.ok ? "common.saved" : res.error));
      if (res.ok) {
        router.refresh();
        onDone?.();
      }
    });

  return (
    <div className="space-y-4 bg-surface p-4 text-body">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input aria-label={tk("product.vendor.name")} className={input} placeholder={tk("product.vendor.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label={tk("product.vendor.market")} className={input} placeholder={tk("product.vendor.market")} value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })} />
        <input aria-label={tk("product.vendor.booth")} className={input} placeholder={tk("product.vendor.booth")} value={f.booth} onChange={(e) => setF({ ...f, booth: e.target.value })} />
        <input aria-label={tk("product.vendor.wechat")} className={input} placeholder={tk("product.vendor.wechat")} value={f.wechat} onChange={(e) => setF({ ...f, wechat: e.target.value })} />
      </div>
      <div className="text-meta font-semibold text-ink-2">{tk("admin.vendors.defaults")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{tk("product.detail.hold")}</span>
        <select className={`${input} w-auto`} aria-label={tk("product.detail.hold")} value={"none" in hold ? "none" : "deposit"} onChange={(e) => setHold(e.target.value === "none" ? { none: true } : { deposit_pct: 0.3, days: 7 })}>
          <option value="none">{tk("product.detail.hold.none")}</option>
          <option value="deposit">{tk("product.detail.hold.deposit", { pct: "N", days: "M" })}</option>
        </select>
        {!("none" in hold) && (
          <>
            <input className={`${input} num w-16`} aria-label={tk("a11y.holdPct")} inputMode="numeric" value={Math.round(hold.deposit_pct * 100)} onChange={(e) => setHold({ ...hold, deposit_pct: Math.min(100, Number(e.target.value) || 0) / 100 })} />%
            <input className={`${input} num w-16`} aria-label={tk("a11y.holdDays")} inputMode="numeric" value={hold.days} onChange={(e) => setHold({ ...hold, days: Number(e.target.value) || 0 })} />d
          </>
        )}
        <label className="ml-4 flex items-center gap-1"><input type="checkbox" checked={sampleOk} onChange={(e) => setSampleOk(e.target.checked)} />{tk("product.sampleOk")}</label>
      </div>
      <div><div className="mb-1 text-meta text-ink-2">{tk("product.detail.labels")}</div><LabelRows rows={labels} onChange={setLabels} types={types} labels={rl} /></div>
      <div><div className="mb-1 text-meta text-ink-2">{tk("product.detail.mods")}</div><ModRows rows={mods} onChange={setMods} labels={rl} items={MOD_ITEMS.map((code) => ({ code, label: tk(`product.option.mod.${code}`) }))} /></div>
      <label className="block text-meta text-ink-2">{tk("admin.vendors.owner")}
        <select className={`${input} mt-1 w-auto`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">{tk("admin.vendors.ownerNone")}</option>
          {vendorUsers.map((u) => <option key={u.id} value={u.id}>{u.email ?? u.id}</option>)}
        </select>
      </label>
      <textarea aria-label={tk("admin.vendors.notes")} className={`${input} min-h-12`} placeholder={tk("admin.vendors.notes")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <div className="flex items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={pending || !f.name.trim()} onClick={save}>{tk("common.save")}</button>
        {msg && <span className="text-meta text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
