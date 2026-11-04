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
      <input aria-label={t(locale, "cn.tasks.trackingPh")} className="field num min-h-10 min-w-0 flex-1 basis-48" placeholder={t(locale, "cn.tasks.trackingPh")} maxLength={40} value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button className="btn btn-primary min-h-10" disabled={pending || tracking.trim().length < 4} onClick={() => start(async () => {
        setMsg(null);
        const r = await shipSample(sampleId, tracking);
        if (!r.ok) return setMsg(t(locale, r.error));
        router.refresh();
      })}>{t(locale, "cn.tasks.ship")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}
