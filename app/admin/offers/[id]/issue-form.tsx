"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { krw } from "@/lib/format";
import { computeOfferFixed, offerDates, offerType } from "@/lib/offers";
import { supplyPriceKrw, targetDiffPct, type CostTier, type LabelOptionCost, type ModOptionCost } from "@/lib/pricing";
import { issueOffer } from "../actions";

type Settings = { fee_rate: number; hidden_margin_rate: number; fx_rate_cny_krw: number; sample_air_per_kg_krw: number; domestic_shipping_krw: number; exclusive_days: number; offer_valid_days: number; target_diff_pct: number };

/**
 * A-04 발행 폼: 브랜드(위 GET 폼으로 선택) + 요청 항목(없으면 추천) → 그 브랜드 요율로 미리보기 → [발행].
 * 미리보기는 서버 발행과 같은 순수 함수(computeOfferFixed). 실제 고정값은 서버가 다시 계산한다.
 */
/** A2: 발행을 막는 이유 — 발행 버튼 바로 위 (버튼 아래 13px로 누른 뒤에 알던 것을 앞으로) */
export function BlockedNote({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div role="note" className="border-l-2 border-l-warn pl-4 text-meta text-warn">
      <span className="block font-medium">{tk("issue.blocked.title")}</span>
      {lines.map((l) => <span key={l} className="mt-1 block">{l}</span>)}
    </div>
  );
}

export function IssueForm(props: {
  /** 서버가 정한 발행 차단 사유(번역된 문장) — 하나라도 있으면 버튼 비활성 */
  blockers: string[];
  /** 이 브랜드에 살아 있는 제안이 걸린 요청 항목 id("" = 추천) */
  liveItemKeys: string[];
  productId: string;
  brand: { id: string; name: string; fee_rate: number | null; hidden_margin_rate: number | null };
  items: { id: string; seq: number; description: string; target_price_krw: number | null; requestTitle: string }[];
  defaultItemId: string | null;
  priorOfferCount: number;
  costTiers: CostTier[];
  weightG: number;
  labels: LabelOptionCost[];
  mods: ModOptionCost[];
  settings: Settings;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState<string>(props.items.some((i) => i.id === props.defaultItemId) ? props.defaultItemId! : (props.items[0]?.id ?? ""));
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const item = props.items.find((i) => i.id === itemId) ?? null;
  const fixed = computeOfferFixed({ costTiers: props.costTiers, weightG: props.weightG, labels: props.labels, mods: props.mods, brand: props.brand, settings: props.settings });
  const supply0 = supplyPriceKrw(fixed.price_tiers[0].product_price_krw, fixed.fee_rate);
  const diff = targetDiffPct(item?.target_price_krw, supply0);
  const needComment = diff !== null && Math.abs(diff) > props.settings.target_diff_pct * 100;
  const type = offerType(itemId || null, props.priorOfferCount);
  const dates = offerDates(type, new Date(), props.settings);
  const blockers = [...props.blockers, ...(props.liveItemKeys.includes(itemId) ? [tk("offer.error.duplicate")] : [])];

  return (
    <div className="space-y-5 text-body">
      <label className="field"><span className="lbl">{tk("issue.item")}</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">{tk("issue.recommend")}</option>
          {props.items.map((i) => <option key={i.id} value={i.id}>{i.requestTitle} · #{i.seq} {i.description}{i.target_price_krw ? ` (₩${krw(i.target_price_krw)})` : ""}</option>)}
        </select>
      </label>

      <table className="tbl [&_td]:py-2.5">
        <thead><tr><th>{tk("issue.qty")}</th><th className="r">{tk("issue.productPrice")}</th><th className="r">{tk("issue.supplyPrice")}</th></tr></thead>
        <tbody>
          {fixed.price_tiers.map((t) => (
            <tr key={t.min_qty}>
              <td className="num">{t.min_qty}+</td>
              <td className="r text-ink-2">₩{krw(t.product_price_krw)}</td>
              <td className="r font-medium">₩{krw(supplyPriceKrw(t.product_price_krw, fixed.fee_rate))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="num text-caption text-muted">
        {tk("issue.formula", { fx: fixed.fx_rate, m: Math.round(fixed.hidden_margin_rate * 100), fee: Math.round(fixed.fee_rate * 100) })}
        {" · "}{tk("issue.sample", { logistics: krw(fixed.sample_logistics_krw), product: krw(fixed.sample_fee_product_krw) })}
      </p>
      {diff !== null && <p className={`num text-meta ${needComment ? "font-medium text-warn" : "text-ink-2"}`}>{tk("issue.diff", { n: diff > 0 ? `+${diff}` : diff })}</p>}
      <p className="text-meta text-ink-2">{tk(`issue.type.${type}`)} · {dates.exclusive_until ? tk("issue.exclusive", { date: dates.exclusive_until }) : tk("issue.nonExclusive")} · {tk("issue.valid", { date: dates.valid_until })}</p>

      <label className="field"><span className="lbl">{tk("issue.comment")}{needComment && " *"}</span>
        <textarea maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="space-y-2 pt-1">
        <BlockedNote lines={blockers} />
        <button className="btn lg w-full" disabled={pending || blockers.length > 0 || (needComment && !comment.trim())} onClick={() => start(async () => {
          setMsg(null);
          const r = await issueOffer({ productId: props.productId, brandId: props.brand.id, requestItemId: itemId || null, comment });
          setMsg(tk(r.ok ? "issue.done" : r.error));
          if (r.ok) router.refresh();
        })}>{tk("issue.submit")}</button>
        {msg && <span className="text-meta text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
