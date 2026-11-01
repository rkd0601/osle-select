"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { computeOfferFixed, offerDates, offerType } from "@/lib/offers";
import { supplyPriceKrw, targetDiffPct, type CostTier, type LabelOptionCost, type ModOptionCost } from "@/lib/pricing";
import { issueOffer } from "../actions";

type Settings = { fee_rate: number; hidden_margin_rate: number; fx_rate_cny_krw: number; sample_air_per_kg_krw: number; domestic_shipping_krw: number; exclusive_days: number; offer_valid_days: number; target_diff_pct: number };

/**
 * A-04 발행 폼: 브랜드(위 GET 폼으로 선택) + 요청 항목(없으면 추천) → 그 브랜드 요율로 미리보기 → [발행].
 * 미리보기는 서버 발행과 같은 순수 함수(computeOfferFixed). 실제 고정값은 서버가 다시 계산한다.
 */
export function IssueForm(props: {
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

  return (
    <div className="space-y-4 bg-surface p-4 text-[13px]">
      <label className="block text-[11px] text-ink-2">{tk("issue.item")}
        <select className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-[13px]" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">{tk("issue.recommend")}</option>
          {props.items.map((i) => <option key={i.id} value={i.id}>{i.requestTitle} · #{i.seq} {i.description}{i.target_price_krw ? ` (₩${krw(i.target_price_krw)})` : ""}</option>)}
        </select>
      </label>

      <table className="w-full text-[12px]">
        <thead className="text-left text-muted"><tr><th>{tk("issue.qty")}</th><th className="text-right">{tk("issue.productPrice")}</th><th className="text-right">{tk("issue.supplyPrice")}</th></tr></thead>
        <tbody className="num">
          {fixed.price_tiers.map((t) => (
            <tr key={t.min_qty} className="border-t border-line">
              <td className="py-1">{t.min_qty}+</td>
              <td className="text-right">₩{krw(t.product_price_krw)}</td>
              <td className="text-right text-[15px] font-semibold">₩{krw(supplyPriceKrw(t.product_price_krw, fixed.fee_rate))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="num text-[11px] text-muted">
        {tk("issue.formula", { fx: fixed.fx_rate, m: Math.round(fixed.hidden_margin_rate * 100), fee: Math.round(fixed.fee_rate * 100) })}
        {" · "}{tk("issue.sample", { logistics: krw(fixed.sample_logistics_krw), product: krw(fixed.sample_fee_product_krw) })}
      </p>
      {diff !== null && <p className={`num ${needComment ? "font-semibold text-warn" : "text-ink-2"}`}>{tk("issue.diff", { n: diff > 0 ? `+${diff}` : diff })}</p>}
      <p className="text-ink-2">{tk(`issue.type.${type}`)} · {dates.exclusive_until ? tk("issue.exclusive", { date: dates.exclusive_until }) : tk("issue.nonExclusive")} · {tk("issue.valid", { date: dates.valid_until })}</p>

      <label className="block text-[11px] text-ink-2">{tk("issue.comment")}{needComment && " *"}
        <textarea className="mt-1 w-full border border-line bg-paper px-2 py-1.5 text-[13px]" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <button className="bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-40" disabled={pending || (needComment && !comment.trim())} onClick={() => start(async () => {
          setMsg(null);
          const r = await issueOffer({ productId: props.productId, brandId: props.brand.id, requestItemId: itemId || null, comment });
          setMsg(tk(r.ok ? "issue.done" : r.error));
          if (r.ok) router.refresh();
        })}>{tk("issue.submit")}</button>
        {msg && <span className="text-[12px] text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
