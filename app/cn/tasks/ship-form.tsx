"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/cn";
import { shipSample } from "./actions";
import { TrackingFoot } from "./order-forms";

/** C-05 샘플 출고: 운송장 입력 → cn_shipped */
export function ShipForm({ sampleId, locale }: { sampleId: string; locale: Locale }) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <TrackingFoot locale={locale} id={`trk-${sampleId}`} value={tracking} onChange={setTracking} maxLength={40} msg={msg} pending={pending}
      onSubmit={() => start(async () => {
        setMsg(null);
        const r = await shipSample(sampleId, tracking);
        if (!r.ok) return setMsg(t(locale, r.error));
        router.refresh();
      })} />
  );
}
