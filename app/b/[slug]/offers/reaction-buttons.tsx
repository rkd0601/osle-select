"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { reactToOffer } from "./actions";

const REASONS = ["price", "design", "fabric", "leadtime", "other"] as const;

/** 카드에서 바로 관심 / 보류 / 거절(사유 1탭 + 한 줄). 버튼은 서버가 계산한 allowed만 (전이는 서버가 다시 검증). */
export function ReactionButtons({ brandId, offerId, status, allowed }: { brandId: string; offerId: string; status: string; allowed: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const send = (reaction: "interested" | "hold" | "declined") =>
    start(async () => {
      setMsg(null);
      const r = await reactToOffer(brandId, offerId, { reaction, reason: reason ?? undefined, note });
      if (!r.ok) return setMsg(tk(r.error));
      setDeclining(false);
      router.refresh();
    });
  const btn = (on: boolean) => `flex-1 border px-2 py-2 text-[13px] ${on ? "border-ink bg-ink text-paper" : "border-line bg-surface"}`;
  if (!allowed.length && status !== "interested" && status !== "hold" && status !== "declined") return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {allowed.includes("interested") || status === "interested" ? (
          <button type="button" disabled={pending || status === "interested"} className={btn(status === "interested")} onClick={() => send("interested")}>♥ {tk("status.offer.interested")}</button>
        ) : null}
        {allowed.includes("hold") || status === "hold" ? (
          <button type="button" disabled={pending || status === "hold"} className={btn(status === "hold")} onClick={() => send("hold")}>{tk("status.offer.hold")}</button>
        ) : null}
        {allowed.includes("declined") || status === "declined" ? (
          <button type="button" disabled={pending || status === "declined"} className={btn(status === "declined")} onClick={() => setDeclining((x) => !x)}>{tk("status.offer.declined")} ▾</button>
        ) : null}
      </div>
      {declining && (
        <div className="space-y-2 bg-surface p-2">
          <div className="flex flex-wrap gap-1">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={`border px-2 py-1 text-[12px] ${reason === r ? "border-ink bg-ink text-paper" : "border-line"}`}>{tk(`decline.${r}`)}</button>
            ))}
          </div>
          <input className="w-full border-0 border-b border-line bg-transparent py-1.5 text-[13px] outline-none" placeholder={tk("offer.declineNote")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" disabled={pending || !reason} className="w-full bg-ink py-2 text-[13px] text-paper disabled:opacity-40" onClick={() => send("declined")}>{tk("offer.declineSubmit")}</button>
        </div>
      )}
      {msg && <p className="text-[12px] text-crit">{msg}</p>}
    </div>
  );
}
