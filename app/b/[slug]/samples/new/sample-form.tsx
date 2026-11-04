"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { VariantMatrix } from "@/components/domain/variant-matrix";
import { Photo } from "@/components/domain/photo";
import { EmptyState } from "@/components/domain/empty-state";
import { createSampleRequest, quoteSample } from "../actions";

type Cand = {
  offerId: string; status: string; code: string | null; name: string | null; image: string | null; productFee: number | null;
  colors: { id: string; name: string; hex: string | null }[]; sizes: { id: string; label: string }[]; variants: { id: string; color_id: string; size_id: string }[];
};
const field = "field mt-1.5";

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
  const [quote, setQuote] = useState<{ logistics: number; productTotal: number; origins: number } | null>(null);
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

  if (!props.candidates.length) return <EmptyState title={tk("sample.new.empty")} action={{ href: `/b/${props.slug}/progress?f=offer`, label: tk("sample.list.toOffers") }} />;
  return (
    <div className="space-y-6 pb-28">
      {!props.canPurchase && <p className="text-meta text-warn">{tk("sample.error.noPurchase")}</p>}
      {props.candidates.map((c) => {
        const on = picked.includes(c.offerId);
        return (
          <section key={c.offerId} className={`border-t pt-5 transition-colors ${on ? "border-ink" : "border-line"}`}>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.offerId] : picked.filter((x) => x !== c.offerId))} />
              <span className="w-16 shrink-0"><Photo src={c.image} /></span>
              <span className="min-w-0">
                <span className="block text-strong font-medium">{c.name}</span>
                {c.status === "hold" && <span className="block text-caption text-ink-2">{tk("sample.new.holdToInterested")}</span>}
                {c.productFee != null && <span className="num block text-caption text-muted">{tk("sample.new.unitProductFee", { n: krw(c.productFee) })}</span>}
              </span>
            </label>
            {on && (
              <div className="mt-4 border-t border-line pt-4">
                <VariantMatrix
                  colors={c.colors} sizes={c.sizes} max={props.qtyMax} totalLabel={tk("sample.new.total")}
                  cells={c.variants.map((v) => ({ variantId: v.id, colorId: v.color_id, sizeId: v.size_id }))}
                  value={qty} onChange={setQty}
                />
                <p className="mt-1 text-caption text-muted">{tk("sample.new.qtyHelp", { n: props.qtyMax })}</p>
              </div>
            )}
          </section>
        );
      })}

      <section className="border-t border-line pt-5 space-y-4">
        <h2 className="label">{tk("sample.new.shipTo")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-meta text-ink-2">{tk("sample.ship.name")}<input className={field} value={ship.name} maxLength={40} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></label>
          <label className="text-meta text-ink-2">{tk("sample.ship.phone")}<input className={field} inputMode="tel" value={ship.phone} maxLength={30} onChange={(e) => setShip({ ...ship, phone: e.target.value })} /></label>
          <label className="text-meta text-ink-2 sm:col-span-2">{tk("sample.ship.address")}<input className={field} value={ship.address} maxLength={200} onChange={(e) => setShip({ ...ship, address: e.target.value })} /></label>
          <label className="text-meta text-ink-2 sm:col-span-2">{tk("sample.ship.memo")}<input className={field} value={ship.memo} maxLength={100} onChange={(e) => setShip({ ...ship, memo: e.target.value })} /></label>
        </div>
      </section>

      <section className="border-t border-line pt-5 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label">{tk("sample.new.logistics")}</span>
          <span className="num text-h1 font-light tracking-[-0.03em]">₩{krw(quote?.logistics ?? 0)}</span>
        </div>
        <p className="text-caption text-muted">{tk("sample.new.logisticsHelp")}</p>
        {(quote?.origins ?? 0) > 1 && <p className="text-meta text-ink-2">{tk("sample.new.splitShip", { n: quote!.origins })}</p>}
        <p className="num text-meta text-ink-2">{tk("sample.new.productIfKept", { n: krw(quote?.productTotal ?? 0) })}</p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-line pt-4 text-body">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{tk("sample.new.agree")}</span>
        </label>
      </section>

      {msg && <p className="text-body text-crit">{msg}</p>}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 py-3 backdrop-blur">
        <div className="wrap"><div className="flex items-center gap-4 lg:w-[calc((100%-264px)*8/12+168px)]">
        <div className="hidden shrink-0 sm:block">
          <div className="text-caption text-ink-2">{tk("sample.new.logistics")}</div>
          <div className="num text-h4 font-light leading-tight">₩{krw(quote?.logistics ?? 0)}</div>
        </div>
        <button disabled={pending || !agree || total < 1 || !props.canPurchase || !ship.name || !ship.phone || ship.address.length < 5} onClick={submit}
          className="btn lg min-w-0 flex-1">
          {pending ? tk("common.saving") : tk("sample.new.submit", { n: total })}
        </button>
        </div></div>
      </div>
    </div>
  );
}
