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
const field = "field mt-2";

/**
 * B-06 샘플 요청서 (모바일 우선). 관심(보류 포함 — 담으면 관심으로) 제안을 묶어 variant별 수량을 숫자로.
 * 금액은 서버가 계산(중량 비노출). v2.7(d-26·S8): "물류비 ₩n · 다음 청구에 합산 / 샘플 상품가 ₩0" + 받은 뒤 구매가 안내, 기한 규칙 동의 필수.
 * 기본 배송지 저장은 대표만(d-31) — 멤버에게는 체크 대신 한 줄 안내.
 */
export function SampleForm(props: {
  brandId: string; slug: string; candidates: Cand[]; preselect: string[]; qtyMax: number; address: { name?: string; phone?: string; address?: string } | null; canPurchase: boolean;
  isOwner: boolean; feedbackDays: number; returnDays: number;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(props.preselect.length ? props.preselect : props.candidates.slice(0, 1).map((c) => c.offerId));
  // 기본 1: 제안마다 첫 variant 1장 (CLAUDE.md "샘플 요청서 기본 1")
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.candidates.flatMap((c) => (c.variants[0] ? [[c.variants[0].id, 1]] : []))),
  );
  const [ship, setShip] = useState({ name: props.address?.name ?? "", phone: props.address?.phone ?? "", address: props.address?.address ?? "", memo: "" });
  // 기본 배송지가 없으면 안내 한 줄 + "이번 주소를 기본 배송지로 저장"(기본 켬) — 저장 위치는 설정과 같은 brands.default_address (7차 W3)
  const noDefault = !props.address?.address;
  const [saveDefault, setSaveDefault] = useState(true);
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
      const r = await createSampleRequest(props.brandId, { lines, shipTo: ship, agreeReturn: agree, ...(noDefault && props.isOwner ? { saveDefault } : {}) });
      if (!r.ok) return setMsg(tk(r.error));
      router.push(`/b/${props.slug}/samples/${r.data.sampleId}`);
    });

  if (!props.candidates.length) return <EmptyState title={tk("sample.new.empty")} action={{ href: `/b/${props.slug}/progress?f=offer`, label: tk("sample.list.toOffers") }} />;
  return (
    <div className="space-y-8">
      {!props.canPurchase && <p className="text-meta text-warn">{tk("sample.error.noPurchase")}</p>}
      {props.candidates.map((c, i) => {
        const on = picked.includes(c.offerId);
        return (
          // 첫 상품 행은 윗 룰 없음 — 페이지 잉크 룰이 바로 위에 있다 (R1 · R8①)
          <section key={c.offerId} className={`${i === 0 ? "" : "border-t pt-4 "}transition-colors ${on ? "border-ink" : "border-line"}`}>
            {/* 8칸 소그리드: 사진 1칸 · 글 6칸(둘째 선에서 시작) · 선택 1칸(L4) */}
            <label className="grid cursor-pointer grid-cols-[56px_1fr_auto] items-start gap-x-4 sm:grid-cols-8 sm:gap-x-6">
              <span className="sm:col-span-1"><Photo src={c.image} /></span>
              <span className="min-w-0 sm:col-span-6">
                <span className="block text-strong font-medium">{c.name}</span>
                {c.status === "hold" && <span className="block text-caption text-ink-2">{tk("sample.new.holdToInterested")}</span>}
                {c.productFee != null && <span className="num block text-caption text-muted">{tk("sample.new.unitProductFee", { n: krw(c.productFee) })}</span>}
              </span>
              <input type="checkbox" className="mt-1 h-5 w-5 sm:col-span-1" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, c.offerId] : picked.filter((x) => x !== c.offerId))} />
            </label>
            {on && (
              <div className="mt-4 border-t border-line pt-4">
                <VariantMatrix
                  colors={c.colors} sizes={c.sizes} max={props.qtyMax} totalLabel={tk("sample.new.total")}
                  cells={c.variants.map((v) => ({ variantId: v.id, colorId: v.color_id, sizeId: v.size_id }))}
                  value={qty} onChange={setQty}
                />
                <p className="mt-2 text-caption text-muted">{tk("sample.new.qtyHelp", { n: props.qtyMax })}</p>
              </div>
            )}
          </section>
        );
      })}

      <section className="border-t border-line pt-4 space-y-4">
        <h2 className="label">{tk("sample.new.shipTo")}</h2>
        {noDefault && <p className="text-caption text-muted">{tk("sample.new.addrHelp")}</p>}
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <label className="text-meta text-ink-2">{tk("sample.ship.name")}<input className={field} value={ship.name} maxLength={40} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></label>
          <label className="text-meta text-ink-2">{tk("sample.ship.phone")}<input className={field} inputMode="tel" value={ship.phone} maxLength={30} onChange={(e) => setShip({ ...ship, phone: e.target.value })} /></label>
          <label className="text-meta text-ink-2 sm:col-span-2">{tk("sample.ship.address")}<input className={field} value={ship.address} maxLength={200} onChange={(e) => setShip({ ...ship, address: e.target.value })} /></label>
          <label className="text-meta text-ink-2 sm:col-span-2">{tk("sample.ship.memo")}<input className={field} value={ship.memo} maxLength={100} onChange={(e) => setShip({ ...ship, memo: e.target.value })} /></label>
        </div>
        {noDefault && props.isOwner && (
          <label className="flex cursor-pointer items-center gap-2 text-meta text-ink-2">
            <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
            <span>{tk("sample.new.saveDefault")}</span>
          </label>
        )}
        {noDefault && !props.isOwner && <p className="text-caption text-muted">{tk("sample.new.memberAddr")}</p>}
      </section>

      {/* 비용(S8, 사이트 수정 6): 지금 내는 돈이 없다는 것부터 — 상품값 무료 / 물류비 = 다음 청구 / 구매는 받아 본 뒤 선택(따로 청구) */}
      <section className="border-t border-line pt-4 space-y-3">
        <h2 className="label">{tk("sample.new.costTitle")}</h2>
        <p className="text-body">{tk("sample.new.costLead", { n: krw(quote?.logistics ?? 0) })}</p>
        <dl className="divide-y divide-line border-y border-line">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <dt className="min-w-0"><span className="text-body">{tk("sample.new.productFree")}</span><span className="block text-meta text-ink-2">{tk("sample.new.productFreeSub")}</span></dt>
            <dd className="num text-body">{tk("sample.new.free")} ₩0</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <dt className="min-w-0"><span className="text-body">{tk("sample.new.logistics")}</span><span className="block text-meta text-ink-2">{tk("sample.new.logisticsHelp")}</span></dt>
            <dd className="num text-h4 font-light">₩{krw(quote?.logistics ?? 0)}</dd>
          </div>
          {(quote?.productTotal ?? 0) > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="min-w-0"><span className="text-body">{tk("sample.new.keepRow")}</span><span className="block text-meta text-ink-2">{tk("sample.new.productIfKept", { n: krw(quote!.productTotal) })}</span></dt>
              <dd className="num text-body text-ink-2">₩{krw(quote!.productTotal)}</dd>
            </div>
          )}
        </dl>
        {(quote?.origins ?? 0) > 1 && <p className="text-meta text-ink-2">{tk("sample.new.splitShip", { n: quote!.origins })}</p>}
        <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-line pt-4 text-body">
          <input type="checkbox" className="mt-1 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{tk("sample.new.agree", { f: props.feedbackDays, r: props.returnDays })}<span className="block text-meta text-ink-2">{tk("sample.new.agreeAuto")}</span></span>
        </label>
      </section>

      {msg && <p className="text-body text-crit">{msg}</p>}
      {/* 아래 바는 8칸 안에 붙는다(sticky) — 룰이 선 위, 금액 3칸 · 버튼 5칸(L1·L8) */}
      <div className="sticky bottom-0 z-10 grid grid-cols-8 items-center gap-x-6 border-t border-line bg-paper py-4">
        <div className="col-span-3 hidden sm:block">
          <div className="text-caption text-ink-2">{tk("sample.new.logisticsLater")}</div>
          <div className="num text-h4 font-light">₩{krw(quote?.logistics ?? 0)}</div>
        </div>
        <button disabled={pending || !agree || total < 1 || !props.canPurchase || !ship.name || !ship.phone || ship.address.length < 5} onClick={submit}
          className="btn lg col-span-8 w-full min-w-0 sm:col-span-5">
          {pending ? tk("common.saving") : tk("sample.new.submit", { n: total })}
        </button>
      </div>
    </div>
  );
}
