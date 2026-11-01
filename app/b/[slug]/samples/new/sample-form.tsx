"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { VariantMatrix } from "@/components/domain/variant-matrix";
import { createSampleRequest, quoteSample } from "../actions";

type Cand = {
  offerId: string; status: string; code: string | null; name: string | null; image: string | null; productFee: number | null;
  colors: { id: string; name: string; hex: string | null }[]; sizes: { id: string; label: string }[]; variants: { id: string; color_id: string; size_id: string }[];
};
const field = "mt-1 w-full border-0 border-b border-line bg-transparent py-2 text-[15px] outline-none focus:border-ink";

/**
 * B-06 샘플 요청서 (모바일 우선). 관심(보류 포함 — 담으면 관심으로) 제안을 묶어 variant별 수량을 숫자로.
 * 금액은 서버가 계산(중량 비노출): 물류비 한 금액 + 미회수 시 상품가 안내. 회수 원칙 동의 필수.
 */
export function SampleForm(props: { brandId: string; slug: string; candidates: Cand[]; preselect: string[]; qtyMax: number; address: { name?: string; phone?: string; address?: string } | null; canPurchase: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(props.preselect.length ? props.preselect : props.candidates.slice(0, 1).map((c) => c.offerId));
  // 기본 1: 제안마다 첫 variant 1장 (CLAUDE.md "샘플 요청서 기본 1")
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.candidates.flatMap((c) => (c.variants[0] ? [[c.variants[0].id, 1]] : []))),
  );
  const [ship, setShip] = useState({ name: props.address?.name ?? "", phone: props.address?.phone ?? "", address: props.address?.address ?? "", memo: "" });
  const [agree, setAgree] = useState(false);
  const [quote, setQuote] = useState<{ logistics: number; productTotal: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lines = useMemo(
    () => props.candidates.filter((c) => picked.includes(c.offerId)).flatMap((c) => c.variants.map((v) => ({ offerId: c.offerId, variantId: v.id, qty: qty[v.id] ?? 0 }))),
    [props.candidates, picked, qty],
  );
  const total = lines.reduce((s, l) => s + l.qty, 0);

  useEffect(() => {
    const t = setTimeout(() => {
      quoteSample(props.brandId, lines).then((r) => setQuote(r.ok ? r.data : null)).catch(() => setQuote(null));
    }, 350);
    return () => clearTimeout(t);
  }, [lines, props.brandId]);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const r = await createSampleRequest(props.brandId, { lines, shipTo: ship, agreeReturn: agree });
      if (!r.ok) return setMsg(tk(r.error));
      router.push(`/b/${props.slug}/samples/${r.data.sampleId}`);
    });

  if (!props.candidates.length) return <p className="py-12 text-center text-[14px] text-muted">{tk("sample.new.empty")}</p>;
  return (
    <div className="space-y-8 pb-28">
      {!props.canPurchase && <p className="bg-warn-soft px-3 py-2 text-[13px] text-warn">{tk("sample.error.noPurchase")}</p>}
      {props.candidates.map((c) => {
        const on = picked.includes(c.offerId);
        return (
          <section key={c.offerId} className="border-t border-ink pt-3">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.offerId] : picked.filter((x) => x !== c.offerId))} />
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                <img src={c.image} alt="" className="aspect-[3/4] w-16 bg-sand object-cover" />
              ) : <span className="aspect-[3/4] w-16 bg-sand" />}
              <span className="min-w-0">
                <span className="num block text-[11px] text-muted">{c.code}</span>
                <span className="block text-[15px] font-medium">{c.name}</span>
                {c.status === "hold" && <span className="block text-[11px] text-ink-2">{tk("sample.new.holdToInterested")}</span>}
                {c.productFee != null && <span className="num block text-[11px] text-muted">{tk("sample.new.unitProductFee", { n: krw(c.productFee) })}</span>}
              </span>
            </label>
            {on && (
              <div className="mt-3">
                <VariantMatrix
                  colors={c.colors} sizes={c.sizes} max={props.qtyMax} totalLabel={tk("sample.new.total")}
                  cells={c.variants.map((v) => ({ variantId: v.id, colorId: v.color_id, sizeId: v.size_id }))}
                  value={qty} onChange={setQty}
                />
                <p className="mt-1 text-[11px] text-muted">{tk("sample.new.qtyHelp", { n: props.qtyMax })}</p>
              </div>
            )}
          </section>
        );
      })}

      <section className="space-y-3 border-t border-line pt-4">
        <h2 className="text-[13px] font-semibold">{tk("sample.new.shipTo")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-[12px] text-ink-2">{tk("sample.ship.name")}<input className={field} value={ship.name} maxLength={40} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></label>
          <label className="text-[12px] text-ink-2">{tk("sample.ship.phone")}<input className={field} inputMode="tel" value={ship.phone} maxLength={30} onChange={(e) => setShip({ ...ship, phone: e.target.value })} /></label>
          <label className="col-span-2 text-[12px] text-ink-2">{tk("sample.ship.address")}<input className={field} value={ship.address} maxLength={200} onChange={(e) => setShip({ ...ship, address: e.target.value })} /></label>
          <label className="col-span-2 text-[12px] text-ink-2">{tk("sample.ship.memo")}<input className={field} value={ship.memo} maxLength={100} onChange={(e) => setShip({ ...ship, memo: e.target.value })} /></label>
        </div>
      </section>

      <section className="space-y-2 bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink-2">{tk("sample.new.logistics")}</span>
          <span className="num text-[24px] font-semibold">₩{krw(quote?.logistics ?? 0)}</span>
        </div>
        <p className="text-[11px] text-muted">{tk("sample.new.logisticsHelp")}</p>
        <p className="num text-[12px] text-ink-2">{tk("sample.new.productIfKept", { n: krw(quote?.productTotal ?? 0) })}</p>
        <label className="mt-2 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{tk("sample.new.agree")}</span>
        </label>
      </section>

      {msg && <p className="text-[13px] text-crit">{msg}</p>}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <button disabled={pending || !agree || total < 1 || !props.canPurchase || !ship.name || !ship.phone || ship.address.length < 5} onClick={submit}
          className="mx-auto block w-full max-w-2xl bg-ink py-3.5 text-[15px] font-semibold text-paper disabled:opacity-40">
          {pending ? tk("common.saving") : tk("sample.new.submit", { n: total })}
        </button>
      </div>
    </div>
  );
}
