"use client";
import { useState, useTransition } from "react";
import { tk } from "@/lib/i18n";
import { submitApplication } from "./actions";

const SCALES = ["lt10k", "10k_50k", "50k_200k", "gt200k", "na"] as const;
const field = "w-full border-0 border-b border-line bg-transparent py-2 text-[14px] outline-none focus:border-ink";

export function ApplyForm() {
  const [v, setV] = useState({ brandName: "", type: "influencer" as "influencer" | "brand", channel: "", channel2: "", followerScale: "na" as (typeof SCALES)[number],
    contactName: "", contactEmail: "", contactPhone: "", bizRegNo: "", ecommerce: false, cnContentOptin: false, note: "", website: "" });
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV({ ...v, [k]: x });
  if (done) return <p className="border-l-2 border-signature bg-surface px-4 py-3 text-[14px]">{tk("apply.done")}</p>;
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setMsg(null);
      const r = await submitApplication({ ...v, channels: [v.channel, v.channel2].filter(Boolean) });
      if (!r.ok) return setMsg(tk(r.error));
      setDone(true);
    }); }}>
      <label className="block text-[12px] text-ink-2">{tk("apply.brandName")}<input className={field} required maxLength={60} value={v.brandName} onChange={(e) => set("brandName", e.target.value)} /></label>
      <div className="flex gap-2 text-[13px]">
        {(["influencer", "brand"] as const).map((t) => (
          <button key={t} type="button" className={`border px-3 py-1.5 ${v.type === t ? "border-ink bg-ink text-paper" : "border-line"}`} onClick={() => set("type", t)}>{tk(`apply.type.${t}`)}</button>
        ))}
      </div>
      <label className="block text-[12px] text-ink-2">{tk("apply.channel")}<input className={field} required type="url" placeholder="https://" maxLength={300} value={v.channel} onChange={(e) => set("channel", e.target.value)} /></label>
      <label className="block text-[12px] text-ink-2">{tk("apply.channel2")}<input className={field} type="url" placeholder="https://" maxLength={300} value={v.channel2} onChange={(e) => set("channel2", e.target.value)} /></label>
      <label className="block text-[12px] text-ink-2">{tk("apply.followers")}
        <select className={field} value={v.followerScale} onChange={(e) => set("followerScale", e.target.value as (typeof SCALES)[number])}>
          {SCALES.map((s) => <option key={s} value={s}>{tk(`apply.scale.${s}`)}</option>)}
        </select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-[12px] text-ink-2">{tk("apply.contactName")}<input className={field} required maxLength={40} value={v.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
        <label className="block text-[12px] text-ink-2">{tk("apply.contactEmail")}<input className={field} required type="email" maxLength={120} value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></label>
        <label className="block text-[12px] text-ink-2">{tk("apply.contactPhone")}<input className={field} maxLength={30} value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></label>
        <label className="block text-[12px] text-ink-2">{tk("apply.bizRegNo")}<input className={field} maxLength={20} value={v.bizRegNo} onChange={(e) => set("bizRegNo", e.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.ecommerce} onChange={(e) => set("ecommerce", e.target.checked)} />{tk("apply.ecommerce")}</label>
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={v.cnContentOptin} onChange={(e) => set("cnContentOptin", e.target.checked)} /><span>{tk("apply.cnOptin")}</span></label>
      <label className="block text-[12px] text-ink-2">{tk("apply.note")}<textarea className={field} rows={3} maxLength={1000} value={v.note} onChange={(e) => set("note", e.target.value)} /></label>
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={v.website} onChange={(e) => set("website", e.target.value)} />
      <button className="bg-ink px-5 py-3 text-[14px] font-medium text-paper disabled:opacity-40" disabled={pending}>{tk("apply.submit")}</button>
      {msg && <p className="text-[12px] text-crit">{msg}</p>}
      <p className="text-[11px] text-muted">{tk("apply.privacy")}</p>
    </form>
  );
}
