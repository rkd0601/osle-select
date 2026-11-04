"use client";
import { useState, useTransition } from "react";
import { tk } from "@/lib/i18n";
import { submitApplication } from "./actions";

const SCALES = ["lt10k", "10k_50k", "50k_200k", "gt200k", "na"] as const;
const field = "field mt-1.5"; // 밑줄 입력(디자인 v2)

export function ApplyForm() {
  const [v, setV] = useState({ brandName: "", type: "influencer" as "influencer" | "brand", channel: "", channel2: "", followerScale: "na" as (typeof SCALES)[number],
    contactName: "", contactEmail: "", contactPhone: "", bizRegNo: "", ecommerce: false, cnContentOptin: false, note: "", website: "" });
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV({ ...v, [k]: x });
  if (done) return <p className="handoff text-lead">{tk("apply.done")}</p>;
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setMsg(null);
      const r = await submitApplication({ ...v, channels: [v.channel, v.channel2].filter(Boolean) });
      if (!r.ok) return setMsg(tk(r.error));
      setDone(true);
    }); }}>
      <label className="block text-caption text-muted">{tk("apply.brandName")}<input className={field} required maxLength={60} value={v.brandName} onChange={(e) => set("brandName", e.target.value)} /></label>
      <div className="flex gap-2">
        {(["influencer", "brand"] as const).map((t) => (
          <button key={t} type="button" className="chip" aria-current={v.type === t ? "true" : undefined} onClick={() => set("type", t)}>{tk(`apply.type.${t}`)}</button>
        ))}
      </div>
      <label className="block text-caption text-muted">{tk("apply.channel")}<input className={field} required type="url" placeholder="https://" maxLength={300} value={v.channel} onChange={(e) => set("channel", e.target.value)} /></label>
      <label className="block text-caption text-muted">{tk("apply.channel2")}<input className={field} type="url" placeholder="https://" maxLength={300} value={v.channel2} onChange={(e) => set("channel2", e.target.value)} /></label>
      <label className="block text-caption text-muted">{tk("apply.followers")}
        <select className={field} value={v.followerScale} onChange={(e) => set("followerScale", e.target.value as (typeof SCALES)[number])}>
          {SCALES.map((s) => <option key={s} value={s}>{tk(`apply.scale.${s}`)}</option>)}
        </select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-caption text-muted">{tk("apply.contactName")}<input className={field} required maxLength={40} value={v.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
        <label className="block text-caption text-muted">{tk("apply.contactEmail")}<input className={field} required type="email" maxLength={120} value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></label>
        <label className="block text-caption text-muted">{tk("apply.contactPhone")}<input className={field} maxLength={30} value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></label>
        <label className="block text-caption text-muted">{tk("apply.bizRegNo")}<input className={field} maxLength={20} value={v.bizRegNo} onChange={(e) => set("bizRegNo", e.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-body"><input type="checkbox" checked={v.ecommerce} onChange={(e) => set("ecommerce", e.target.checked)} />{tk("apply.ecommerce")}</label>
      <label className="flex items-start gap-2 text-body"><input type="checkbox" className="mt-0.5" checked={v.cnContentOptin} onChange={(e) => set("cnContentOptin", e.target.checked)} /><span>{tk("apply.cnOptin")}</span></label>
      <label className="block text-caption text-muted">{tk("apply.note")}<textarea className={field} rows={3} maxLength={1000} value={v.note} onChange={(e) => set("note", e.target.value)} /></label>
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={v.website} onChange={(e) => set("website", e.target.value)} />
      <button className="btn lg w-full sm:w-auto" disabled={pending}>{tk("apply.submit")}</button>
      {msg && <p className="text-meta text-crit">{msg}</p>}
      <p className="text-caption text-muted">{tk("apply.privacy")}</p>
    </form>
  );
}
