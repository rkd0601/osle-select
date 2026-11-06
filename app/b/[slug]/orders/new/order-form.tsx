"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { VariantMatrix } from "@/components/domain/variant-matrix";
import { Photo } from "@/components/domain/photo";
import { EmptyState } from "@/components/domain/empty-state";
import { previewReserve, reserveOrder } from "../actions";

export type OrderCand = {
  offerId: string; eligible: boolean; expired: boolean; reorder: boolean; code: string | null; name: string | null; image: string | null;
  minQty: number | null; supplyType: string | null; leadDays: number | null; depositPct: number | null; holdDays: number | null;
  tiers: { min_qty: number; product_price_krw: number; supply_krw: number }[]; mods: { item: string; moq: number; price_krw: number }[];
  colors: { id: string; name: string; hex: string | null }[]; sizes: { id: string; label: string }[]; variants: { id: string; color_id: string; size_id: string }[];
};
const field = "field num mt-2";
const QTY_MAX = 100_000;

/**
 * B-08 1단계 예약: 공구 일정 → 예상 수량(variant 숫자 매트릭스) → 홀딩 선택 → 디테일 수정 요청(MOQ 충족 시) → 예약.
 * 재고 확인 뒤 위아더가 선금(홀딩)·견적을 안내한다. 금액은 서버 계산 미리보기(확정 아님).
 */
/** shipTo: 받는 곳 읽기 전용 줄(d-30) — 서버가 그려 넘긴다 */
export function OrderForm(props: { brandId: string; slug: string; candidates: OrderCand[]; preselect: string[]; canPurchase: boolean; canWaive?: boolean; shipTo?: React.ReactNode }) {
  const router = useRouter();
  const eligible = props.candidates.filter((c) => c.eligible);
  const [picked, setPicked] = useState<string[]>(props.preselect.length ? props.preselect : eligible.slice(0, 1).map((c) => c.offerId));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [dates, setDates] = useState({ gbOpen: "", gbClose: "", deliveryPromise: "" });
  const [hold, setHold] = useState<"deposit" | "none">("none");
  const [ack, setAck] = useState(false);
  const [mods, setMods] = useState<Record<string, { on: boolean; note: string }>>({});
  const [preview, setPreview] = useState<{ subtotal_krw: number; fee_krw: number; groups: { offerId: string; qty: number; unit_supply_krw: number }[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [waive, setWaive] = useState(false); // 관리자 대행: 샘플 게이트 면제 (제안 관심·유효 기간 내만)
  const pickable = (c: OrderCand) => c.eligible || (waive && !c.expired);
  const [pending, start] = useTransition();

  const chosen = useMemo(() => props.candidates.filter((c) => picked.includes(c.offerId)), [props.candidates, picked]);
  const lines = useMemo(
    () => chosen.flatMap((c) => c.variants.map((v) => ({ offerId: c.offerId, variantId: v.id, expectedQty: qty[v.id] ?? 0 }))),
    [chosen, qty],
  );
  const offerQty = (id: string) => lines.filter((l) => l.offerId === id).reduce((n, l) => n + l.expectedQty, 0);
  const total = lines.reduce((s, l) => s + l.expectedQty, 0);
  const depositOk = chosen.length > 0 && chosen.every((c) => c.depositPct != null);
  const depositPct = depositOk ? Math.max(...chosen.map((c) => c.depositPct ?? 0)) : null;
  const belowMin = chosen.filter((c) => c.minQty != null && offerQty(c.offerId) < c.minQty);

  useEffect(() => {
    if (!depositOk && hold === "deposit") setHold("none");
  }, [depositOk, hold]);
  useEffect(() => {
    const t = setTimeout(() => {
      previewReserve(props.brandId, lines.map((l) => ({ offerId: l.offerId, qty: l.expectedQty }))).then((r) => setPreview(r.ok ? r.data : null)).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [lines, props.brandId]);

  const modKey = (offerId: string, item: string) => `${offerId}:${item}`;
  const submit = () =>
    start(async () => {
      setMsg(null);
      const modRequests = chosen.flatMap((c) => c.mods.flatMap((m) => (mods[modKey(c.offerId, m.item)]?.on ? [{ offerId: c.offerId, item: m.item, note: mods[modKey(c.offerId, m.item)].note }] : [])));
      const r = await reserveOrder(props.brandId, { ...dates, lines: lines.filter((l) => l.expectedQty > 0), holdChoice: hold, holdAck: ack, modRequests, waiveSampleGate: waive });
      if (!r.ok) return setMsg(tk(r.error));
      router.push(`/b/${props.slug}/orders/${r.data.orderId}${r.data.warnings.length ? "?warn=schedule" : ""}`);
    });

  if (!props.candidates.length) return <EmptyState title={tk("order.new.empty")} action={{ href: `/b/${props.slug}/progress?f=sample`, label: tk("order.list.toSamples") }} />;
  return (
    <div className="space-y-8">
      {!props.canPurchase && <p className="text-meta text-warn">{tk("order.error.noPurchase")}</p>}
      {props.canWaive && (
        <label className="flex items-start gap-2 text-body text-warn">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={waive} onChange={(e) => { setWaive(e.target.checked); if (!e.target.checked) setPicked(picked.filter((id) => props.candidates.find((c) => c.offerId === id)?.eligible)); }} />
          <span>{tk("order.new.waive")}</span>
        </label>
      )}

      <section className="border-t border-line pt-4 grid gap-x-6 gap-y-4 sm:grid-cols-8">
        {/* 일정 셋 = 3·3·2(L5) */}
        <h2 className="label sm:col-span-8">{tk("order.new.schedule")}</h2>
        <label className="text-meta text-ink-2 sm:col-span-3">{tk("order.field.gbOpen")}<input type="date" className={field} value={dates.gbOpen} onChange={(e) => setDates({ ...dates, gbOpen: e.target.value })} /></label>
        <label className="text-meta text-ink-2 sm:col-span-3">{tk("order.field.gbClose")}<input type="date" className={field} value={dates.gbClose} onChange={(e) => setDates({ ...dates, gbClose: e.target.value })} /></label>
        <label className="text-meta text-ink-2 sm:col-span-2">{tk("order.field.deliveryPromise")}<input type="date" className={field} value={dates.deliveryPromise} onChange={(e) => setDates({ ...dates, deliveryPromise: e.target.value })} /></label>
        <p className="text-caption text-muted sm:col-span-8">{tk("order.new.scheduleHelp")}</p>
      </section>

      {props.candidates.map((c) => {
        const on = picked.includes(c.offerId);
        return (
          <section key={c.offerId} className={`border-t pt-4 transition-colors ${on ? "border-ink" : "border-line"} ${pickable(c) ? "" : "opacity-60"}`}>
            {/* 8칸 소그리드: 사진 1칸 · 글 6칸(둘째 선에서 시작) · 선택 1칸(L4) */}
            <label className="grid cursor-pointer grid-cols-[56px_1fr_auto] items-start gap-x-4 sm:grid-cols-8 sm:gap-x-6">
              <span className="sm:col-span-1"><Photo src={c.image} /></span>
              <span className="min-w-0 text-body sm:col-span-6">
                <span className="block text-strong font-medium">{c.name}</span>
                <span className="num block text-caption text-ink-2">
                  {c.tiers.map((t) => tk("order.new.tier", { q: t.min_qty, n: krw(t.supply_krw) })).join(" · ")} <span className="text-muted">{tk("order.new.tierHelp")}</span>
                </span>
                <span className="num block text-caption text-muted">
                  {c.minQty != null && tk("order.new.minQty", { n: c.minQty })}
                  {c.depositPct != null ? ` · ${tk("order.new.holdDeposit", { p: Math.round(c.depositPct * 100), d: c.holdDays ?? 0 })}` : ` · ${tk("order.new.holdNone")}`}
                </span>
                {!c.eligible && <span className="block text-caption text-warn">{tk(c.expired ? "order.new.expired" : "order.new.notEligible")}</span>}
                {c.reorder && <span className="block text-caption text-ink-2">{tk("order.new.reorder")}</span>}
              </span>
              <input type="checkbox" className="mt-1 h-5 w-5 sm:col-span-1" disabled={!pickable(c)} checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.offerId] : picked.filter((x) => x !== c.offerId))} />
            </label>
            {on && (
              <div className="mt-4 space-y-3 border-t border-line pt-4">
                <VariantMatrix
                  colors={c.colors} sizes={c.sizes} max={QTY_MAX} totalLabel={tk("sample.new.total")}
                  cells={c.variants.map((v) => ({ variantId: v.id, colorId: v.color_id, sizeId: v.size_id }))}
                  value={qty} onChange={setQty}
                />
                {c.minQty != null && offerQty(c.offerId) < c.minQty && <p className="num text-caption text-warn">{tk("order.new.belowMin", { n: c.minQty })}</p>}
                {c.mods.length > 0 && (
                  <div className="space-y-1">
                    <p className="label">{tk("order.new.mods")}</p>
                    {c.mods.map((m) => {
                      const k = modKey(c.offerId, m.item);
                      const ok = offerQty(c.offerId) >= m.moq;
                      return (
                        <label key={m.item} className={`flex flex-wrap items-center gap-2 text-meta ${ok ? "" : "text-muted"}`}>
                          <input type="checkbox" disabled={!ok} checked={!!mods[k]?.on && ok} onChange={(e) => setMods({ ...mods, [k]: { on: e.target.checked, note: mods[k]?.note ?? "" } })} />
                          <span>{tk(`product.option.mod.${m.item}`)}</span>
                          <span className="num text-muted">{tk("order.new.modPrice", { n: krw(m.price_krw), moq: m.moq })}</span>
                          {mods[k]?.on && ok && <input aria-label={tk("order.new.modNote")} className="field min-w-40 flex-1 py-1" maxLength={200} placeholder={tk("order.new.modNote")} value={mods[k].note} onChange={(e) => setMods({ ...mods, [k]: { on: true, note: e.target.value } })} />}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      <section className="border-t border-line pt-4 space-y-3">
        <h2 className="label">{tk("order.new.hold")}</h2>
        <label className={`flex items-start gap-2 text-body ${depositOk ? "" : "text-ink-2"}`}>
          <input type="radio" name="hold" disabled={!depositOk} checked={hold === "deposit"} onChange={() => setHold("deposit")} />
          <span>{depositPct != null ? tk("order.new.holdDepositPick", { p: Math.round(depositPct * 100) }) : tk("order.new.holdDepositUnavailable")}</span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="hold" checked={hold === "none"} onChange={() => setHold("none")} />
          <span>{tk("order.new.holdNonePick")}</span>
        </label>
        {hold === "none" && (
          <label className="flex items-start gap-2 text-meta text-warn">
            <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{tk("order.new.holdAck")}</span>
          </label>
        )}
        <p className="text-caption text-muted">{tk("order.new.holdHelp")}</p>
      </section>

      <section className="border-t border-line pt-4 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label">{tk("order.new.estimate")}</span>
          <span className="num text-h1 font-light tracking-[-0.03em]">₩{krw((preview?.subtotal_krw ?? 0) + (preview?.fee_krw ?? 0))}</span>
        </div>
        <p className="text-caption text-muted">{tk("order.new.estimateHelp")}</p>
      </section>

      {props.shipTo}

      {msg && <p className="text-body text-crit">{msg}</p>}
      {/* 아래 바는 8칸 안에 붙는다(sticky) — 룰이 선 위, 금액 3칸 · 버튼 5칸(L1·L8) */}
      <div className="sticky bottom-0 z-10 grid grid-cols-8 items-center gap-x-6 border-t border-line bg-paper py-4">
        <div className="col-span-3 hidden sm:block">
          <div className="text-caption text-ink-2">{tk("order.new.estimate")}</div>
          <div className="num text-h4 font-light">₩{krw((preview?.subtotal_krw ?? 0) + (preview?.fee_krw ?? 0))}</div>
        </div>
        <button
          disabled={pending || total < 1 || !props.canPurchase || belowMin.length > 0 || !dates.gbOpen || !dates.gbClose || !dates.deliveryPromise || (hold === "none" && !ack)}
          onClick={submit}
          className="btn lg col-span-8 w-full min-w-0 sm:col-span-5"
        >
          {pending ? tk("common.saving") : tk("order.new.submit", { n: total })}
        </button>
      </div>
    </div>
  );
}
