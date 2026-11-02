"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { adjustBrandCredit, approveApplication, inviteBrandMember, rejectApplication, setBrandStatus, updateBrandTerms } from "./actions";

type R = { ok: true; data?: unknown } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<R>, onOk?: (r: R & { ok: true }) => void) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok) return setMsg(tk(r.error));
    onOk?.(r);
    router.refresh();
  });
  return { pending, msg, setMsg, run };
}
const field = "border-0 border-b border-line bg-transparent py-1.5 text-[13px] outline-none";
const btn = "bg-ink px-3 py-1.5 text-[12px] font-medium text-paper disabled:opacity-40";

export function ApplicationRow({ a }: { a: { id: string; brand_name: string; type: string; channels: string[]; follower_scale: string | null; contact_name: string; contact_email: string; contact_phone: string | null; biz_reg_no: string | null; is_ecommerce_registered: boolean | null; cn_content_optin: boolean; note: string | null; created_at: string } }) {
  const { pending, msg, setMsg, run } = useRun();
  const [slug, setSlug] = useState(a.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40));
  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-semibold">{a.brand_name}</span>
        <span className="text-ink-2">{tk(`apply.type.${a.type}`)} · {a.follower_scale ? tk(`apply.scale.${a.follower_scale}`) : ""}</span>
        <span className="text-ink-2">{a.contact_name} · {a.contact_email}{a.contact_phone ? ` · ${a.contact_phone}` : ""}</span>
        {a.cn_content_optin && <span className="text-[11px] text-signature">{tk("admin.brands.cnOptin")}</span>}
      </div>
      <div className="flex flex-wrap gap-3 text-[12px]">
        {a.channels.map((c) => <a key={c} href={c} target="_blank" rel="noreferrer noopener" className="break-all text-signature underline">{c}</a>)}
      </div>
      {a.note && <p className="whitespace-pre-wrap text-[12px] text-ink-2">{a.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">/b/</span>
        <input className={`${field} w-44`} value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        <button className={btn} disabled={pending || !/^[a-z0-9-]{3,40}$/.test(slug)}
          onClick={() => run(() => approveApplication(a.id, { slug }), (r) => {
            const d = r.data as { url: string; emailed: boolean; inviteFailed: boolean };
            if (d.inviteFailed) setMsg(tk("admin.brands.inviteRetry"));
            else if (!d.emailed) setMsg(tk("admin.brands.inviteLink", { url: d.url }));
          })}>{tk("admin.brands.approve")}</button>
        <button className="border border-line px-3 py-1.5 text-[12px]" disabled={pending} onClick={() => window.confirm(tk("admin.brands.rejectAsk")) && run(() => rejectApplication(a.id))}>{tk("admin.brands.reject")}</button>
      </div>
      {msg && <p className="break-all text-[12px] text-crit">{msg}</p>}
    </div>
  );
}

export function BrandTermsForm(p: { brandId: string; tier: string; feeRate: number | null; marginRate: number | null }) {
  const { pending, msg, run } = useRun();
  const [tier, setTier] = useState(p.tier);
  const [fee, setFee] = useState(p.feeRate == null ? "" : String(Math.round(p.feeRate * 1000) / 10));
  const [margin, setMargin] = useState(p.marginRate == null ? "" : String(Math.round(p.marginRate * 1000) / 10));
  const rate = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 10) / 1000);
  const bad = [fee, margin].some((s) => s.trim() !== "" && (!Number.isFinite(Number(s)) || Number(s) < 0 || Number(s) > 50));
  return (
    <div className="flex flex-wrap items-end gap-4 text-[13px]">
      <label className="text-[11px] text-muted">{tk("admin.brands.tier")}
        <select className={`${field} block`} value={tier} onChange={(e) => setTier(e.target.value)}>
          {["new", "proven"].map((t) => <option key={t} value={t}>{tk(`admin.brands.tier.${t}`)}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-muted">{tk("admin.brands.fee")} %<input className={`${field} num block w-20`} inputMode="decimal" placeholder={tk("admin.brands.default")} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
      <label className="text-[11px] text-muted">{tk("admin.brands.margin")} %<input className={`${field} num block w-20`} inputMode="decimal" placeholder={tk("admin.brands.default")} value={margin} onChange={(e) => setMargin(e.target.value)} /></label>
      <button className={btn} disabled={pending || bad} onClick={() => window.confirm(tk("admin.brands.termsAsk")) && run(() => updateBrandTerms(p.brandId, { tier, feeRate: rate(fee), hiddenMarginRate: rate(margin) }))}>{tk("common.save")}</button>
      {msg && <span className="text-[12px] text-crit">{msg}</span>}
    </div>
  );
}

export function CreditForm({ brandId }: { brandId: string }) {
  const { pending, msg, setMsg, run } = useRun();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-3 text-[13px]">
      <input className={`${field} num w-32`} inputMode="numeric" value={amount || ""} placeholder="±원" onChange={(e) => setAmount(Math.trunc(Number(e.target.value.replace(/[^0-9-]/g, "")) || 0))} />
      <input className={`${field} flex-1`} maxLength={200} placeholder={tk("admin.brands.creditReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={btn} disabled={pending || !amount || !reason.trim()}
        onClick={() => window.confirm(tk("admin.brands.creditAsk", { n: krw(amount) })) && run(() => adjustBrandCredit(brandId, { amount, reason }), (r) => {
          setMsg(tk("admin.brands.creditDone", { n: krw((r.data as { applied: number }).applied) }));
          setAmount(0); setReason("");
        })}>{tk("admin.brands.creditApply")}</button>
      {msg && <span className="text-[12px] text-ink-2">{msg}</span>}
    </div>
  );
}

export function StatusToggle({ brandId, status }: { brandId: string; status: string }) {
  const { pending, msg, run } = useRun();
  const next = status === "active" ? "suspended" : "active";
  return (
    <span className="flex items-center gap-2">
      <span className={`text-[12px] ${status === "suspended" ? "text-crit" : "text-ink-2"}`}>{tk(`admin.brands.status.${status}`)}</span>
      <button className="text-[12px] text-muted underline-offset-4 hover:underline" disabled={pending}
        onClick={() => window.confirm(tk(`admin.brands.statusAsk.${next}`)) && run(() => setBrandStatus(brandId, next))}>{tk(`admin.brands.toStatus.${next}`)}</button>
      {msg && <span className="text-[12px] text-crit">{msg}</span>}
    </span>
  );
}

export function InviteForm({ brandId }: { brandId: string }) {
  const { pending, msg, setMsg, run } = useRun();
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"owner" | "member">("member");
  const [canPurchase, setCanPurchase] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <input className={`${field} w-56`} type="email" maxLength={120} placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <select className={field} value={level} onChange={(e) => setLevel(e.target.value as "owner" | "member")}>
        {(["member", "owner"] as const).map((l) => <option key={l} value={l}>{tk(`admin.brands.level.${l}`)}</option>)}
      </select>
      {level === "member" && <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={canPurchase} onChange={(e) => setCanPurchase(e.target.checked)} />{tk("admin.brands.canPurchase")}</label>}
      <button className={btn} disabled={pending || !/.+@.+\..+/.test(email)}
        onClick={() => run(() => inviteBrandMember(brandId, { email, level, canPurchase }), (r) => {
          const d = r.data as { url: string; emailed: boolean };
          setMsg(d.emailed ? tk("admin.brands.inviteSent") : tk("admin.brands.inviteLink", { url: d.url }));
          setEmail("");
        })}>{tk("admin.brands.invite")}</button>
      {msg && <span className="break-all text-[12px] text-ink-2">{msg}</span>}
    </div>
  );
}
