"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { reactToOffer } from "./actions";

const REASONS = ["price", "design", "fabric", "leadtime", "other"] as const;

/**
 * 관심 / 보류 / 거절(사유 1탭 + 한 줄). 버튼은 서버가 계산한 allowed만 (전이는 서버가 다시 검증).
 * 디자인 v2 `.react`: 36px 버튼 3개(관심 = 주, 나머지 보조), 화살표·기호 없음.
 * card=true(라인시트 카드)면 관심 표시 뒤엔 버튼 대신 금색 짧은 룰 + "관심 표시함"(`.excl`). 상세 화면은 지금 상태가 채워진 버튼으로 남는다.
 */
export function ReactionButtons({ brandId, offerId, status, allowed, card = false }: { brandId: string; offerId: string; status: string; allowed: string[]; card?: boolean }) {
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
  if (card && status === "interested") return <div className="excl">{tk("linesheet.interestedDone")}</div>;
  if (!allowed.length && status !== "interested" && status !== "hold" && status !== "declined") return null;
  // 지금 상태 버튼은 채워서(ink) 비활성, 나머지는 보조. 아무 반응 전이면 관심만 주 버튼.
  const cls = (k: string) => `btn sm min-w-0 flex-1 ${status === k ? "disabled:opacity-100" : k === "interested" && !["hold", "declined"].includes(status) ? "" : "sec"}`;
  return (
    <div>
      <div className="react">
        {allowed.includes("interested") || status === "interested" ? (
          <button type="button" disabled={pending || status === "interested"} className={cls("interested")} onClick={() => send("interested")}>{tk("status.offer.interested")}</button>
        ) : null}
        {allowed.includes("hold") || status === "hold" ? (
          <button type="button" disabled={pending || status === "hold"} className={cls("hold")} onClick={() => send("hold")}>{tk("status.offer.hold")}</button>
        ) : null}
        {allowed.includes("declined") || status === "declined" ? (
          <button type="button" disabled={pending || status === "declined"} aria-expanded={declining} className={cls("declined")} onClick={() => setDeclining((x) => !x)}>{tk("status.offer.declined")}</button>
        ) : null}
      </div>
      {declining && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={tk("offer.declineReason")}>
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className="chip" aria-pressed={reason === r}>{tk(`decline.${r}`)}</button>
            ))}
          </div>
          <input aria-label={tk("offer.declineNote")} className="field" placeholder={tk("offer.declineNote")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" disabled={pending || !reason} className="btn sm w-full" onClick={() => send("declined")}>{tk("offer.declineSubmit")}</button>
        </div>
      )}
      {msg && <p className="mt-2 text-meta text-crit">{msg}</p>}
    </div>
  );
}
