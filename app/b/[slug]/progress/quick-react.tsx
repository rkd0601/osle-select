"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { reactToOffer } from "../offers/actions";

/**
 * 진행 카드의 새 제안 버튼 둘(디자인 v2.2 §5 진행): "관심 · 샘플에 담기"(ink) + "보류"(sec).
 * 서버 로직은 기존 B-04 `reactToOffer` 그대로(전이·검증은 서버). 성공하면 새로고침 → 카드 문장이 "관심 표시함 · 샘플 요청서에 담김"으로 바뀌고 담김 바가 뜬다.
 * 거절(사유 입력)은 제안 상세에서.
 */
export function QuickReact({ brandId, offerId, name }: { brandId: string; offerId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const send = (reaction: "interested" | "hold") =>
    start(async () => {
      setMsg(null);
      const r = await reactToOffer(brandId, offerId, { reaction });
      if (!r.ok) return setMsg(tk(r.error));
      router.refresh();
    });
  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
      <button type="button" className="btn sm" disabled={pending} aria-label={`${name} ${tk("progress.react.interested")}`} onClick={() => send("interested")}>
        {tk("progress.react.interested")}
      </button>
      <button type="button" className="btn sm sec" disabled={pending} aria-label={`${name} ${tk("progress.react.hold")}`} onClick={() => send("hold")}>
        {tk("progress.react.hold")}
      </button>
      {msg && <p role="alert" className="basis-full text-meta text-crit">{msg}</p>}
    </div>
  );
}
