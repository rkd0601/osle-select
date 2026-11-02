"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/cn";
import { shipSample } from "./actions";

/** C-05 출고: 운송장 입력 → cn_shipped */
export function ShipForm({ sampleId, locale }: { sampleId: string; locale: Locale }) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={t(locale, "cn.tasks.trackingPh")} className="flex-1 border border-line px-2 py-1.5 text-body" placeholder={t(locale, "cn.tasks.trackingPh")} maxLength={40} value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button className="bg-ink px-3 py-1.5 text-body text-paper disabled:opacity-40" disabled={pending || tracking.trim().length < 4} onClick={() => start(async () => {
        setMsg(null);
        const r = await shipSample(sampleId, tracking);
        if (!r.ok) return setMsg(t(locale, r.error));
        router.refresh();
      })}>{t(locale, "cn.tasks.ship")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}
