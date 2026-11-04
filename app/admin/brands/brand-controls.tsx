"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { krw } from "@/lib/format";
import { adjustBrandCredit, approveApplication, decideSlugRequest, inviteBrandMember, rejectApplication, setBrandStatus, updateBrandTerms } from "./actions";

type R = { ok: true; data?: unknown } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // onOk가 false를 돌려주면 새로고침을 미룬다 — 화면에 남겨야 할 결과(초대 링크)가 목록 갱신으로 사라지지 않게
  const run = (fn: () => Promise<R>, onOk?: (r: R & { ok: true }) => void | false) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok) return setMsg(tk(r.error));
    if (onOk?.(r) === false) return;
    router.refresh();
  });
  return { pending, msg, setMsg, run, refresh: () => router.refresh() };
}
const field = "border-0 border-b border-line bg-transparent py-1.5 text-body outline-none";
const btn = "btn btn-primary btn-sm";

type Application = { id: string; brand_name: string; type: string; channels: string[]; follower_scale: string | null; contact_name: string; contact_email: string; contact_phone: string | null; biz_reg_no: string | null; is_ecommerce_registered: boolean | null; cn_content_optin: boolean; note: string | null; created_at: string };

/**
 * 대기 중 신청 목록. 승인하면 서버 액션의 revalidate로 그 신청이 목록에서 빠지는데, 메일 키가 없을 때 **초대 링크가 대표를 초대할 유일한 수단**이다.
 * 그래서 이 목록(항상 마운트)이 승인된 행을 "확인"을 누를 때까지 붙잡아 둔다 — 행 컴포넌트 안의 상태는 행과 함께 사라지기 때문.
 */
export function ApplicationList({ apps }: { apps: Application[] }) {
  const router = useRouter();
  const [kept, setKept] = useState<{ a: Application; msg: string }[]>([]);
  const keptIds = new Set(kept.map((k) => k.a.id));
  const rows = apps.filter((a) => !keptIds.has(a.id));
  if (!rows.length && !kept.length) return null;
  return (
    <section className="card border-warn">
      <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="eyebrow">{tk("admin.brands.applications")}<span className="num ml-1.5 text-ink">{rows.length}</span></h2>
      </header>
      <ul className="divide-y divide-line">
        {kept.map(({ a, msg }) => (
          <li key={a.id} className="space-y-2 bg-signature-soft/40 px-5 py-4 text-body">
            <span className="font-semibold">{a.brand_name}</span>
            <p className="break-all text-meta text-ink">{msg}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => { setKept((k) => k.filter((x) => x.a.id !== a.id)); router.refresh(); }}>{tk("admin.brands.inviteDone")}</button>
          </li>
        ))}
        {rows.map((a) => (
          <li key={a.id} className="px-5 py-4">
            <ApplicationRow a={a} onKeep={(msg) => setKept((k) => [...k, { a, msg }])} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApplicationRow({ a, onKeep }: { a: Application; onKeep: (msg: string) => void }) {
  const { pending, msg, run } = useRun();
  const [slug, setSlug] = useState(a.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40));
  return (
    <div className="space-y-2 text-body">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-semibold">{a.brand_name}</span>
        <span className="text-ink-2">{tk(`apply.type.${a.type}`)} · {a.follower_scale ? tk(`apply.scale.${a.follower_scale}`) : ""}</span>
        <span className="text-ink-2">{a.contact_name} · {a.contact_email}{a.contact_phone ? ` · ${a.contact_phone}` : ""}</span>
        {a.cn_content_optin && <span className="text-caption text-signature">{tk("admin.brands.cnOptin")}</span>}
      </div>
      <div className="flex flex-wrap gap-3 text-meta">
        {a.channels.map((c) => <a key={c} href={c} target="_blank" rel="noreferrer noopener" className="break-all text-signature underline">{c}</a>)}
      </div>
      {a.note && <p className="whitespace-pre-wrap text-meta text-ink-2">{a.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-meta text-muted">/b/</span>
        <input className={`${field} w-44`} aria-label={tk("a11y.slug")} value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        <button className={btn} disabled={pending || !/^[a-z0-9-]{3,40}$/.test(slug)}
          onClick={() => run(() => approveApplication(a.id, { slug }), (r) => {
            const d = r.data as { brandId: string; url: string; emailed: boolean; inviteFailed: boolean };
            if (d.emailed && !d.inviteFailed) return;
            // 메일이 안 나갔으면 이 링크가 대표를 초대할 유일한 수단 — 목록(ApplicationList)이 "확인"까지 붙잡아 둔다
            onKeep(d.inviteFailed ? tk("admin.brands.inviteRetry", { path: `/admin/brands/${d.brandId}` }) : tk("admin.brands.inviteLink", { url: d.url }));
            return false;
          })}>{tk("admin.brands.approve")}</button>
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => window.confirm(tk("admin.brands.rejectAsk")) && run(() => rejectApplication(a.id))}>{tk("admin.brands.reject")}</button>
      </div>
      {msg && <p className="break-all text-meta text-crit">{msg}</p>}
    </div>
  );
}

export function BrandTermsForm(p: { brandId: string; tier: string; feeRate: number | null; marginRate: number | null; liveOffers: number }) {
  const { pending, msg, run } = useRun();
  const [tier, setTier] = useState(p.tier);
  const [fee, setFee] = useState(p.feeRate == null ? "" : String(Math.round(p.feeRate * 1000) / 10));
  const [margin, setMargin] = useState(p.marginRate == null ? "" : String(Math.round(p.marginRate * 1000) / 10));
  const rate = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 10) / 1000);
  const bad = [fee, margin].some((s) => s.trim() !== "" && (!Number.isFinite(Number(s)) || Number(s) < 0 || Number(s) > 50));
  return (
    <div className="flex flex-wrap items-end gap-4 text-body">
      <label className="text-caption text-muted">{tk("admin.brands.tier")}
        <select className={`${field} block`} value={tier} onChange={(e) => setTier(e.target.value)}>
          {["new", "proven"].map((t) => <option key={t} value={t}>{tk(`admin.brands.tier.${t}`)}</option>)}
        </select>
      </label>
      <label className="text-caption text-muted">{tk("admin.brands.fee")} %<input className={`${field} num block w-20`} inputMode="decimal" placeholder={tk("admin.brands.default")} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
      <label className="text-caption text-muted">{tk("admin.brands.margin")} %<input className={`${field} num block w-20`} inputMode="decimal" placeholder={tk("admin.brands.default")} value={margin} onChange={(e) => setMargin(e.target.value)} /></label>
      <button className={btn} disabled={pending || bad} onClick={() => window.confirm(tk("admin.brands.termsAsk")) && run(() => updateBrandTerms(p.brandId, { tier, feeRate: rate(fee), hiddenMarginRate: rate(margin) }))}>{tk("common.save")}</button>
      {/* 조건 변경은 재발행부터 — 이미 발행된 제안은 발행 시점 요율로 고정 (절대 규칙 3, DECISIONS r7-11) */}
      <p className="basis-full text-meta text-ink-2">{tk("admin.brands.termsNote", { n: p.liveOffers })}</p>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}

export function CreditForm({ brandId }: { brandId: string }) {
  const { pending, msg, setMsg, run } = useRun();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-3 text-body">
      <input aria-label={tk("admin.brands.creditPlaceholder")} className={`${field} num w-32`} inputMode="numeric" value={amount || ""} placeholder={tk("admin.brands.creditPlaceholder")} onChange={(e) => setAmount(Math.trunc(Number(e.target.value.replace(/[^0-9-]/g, "")) || 0))} />
      <input aria-label={tk("admin.brands.creditReason")} className={`${field} flex-1`} maxLength={200} placeholder={tk("admin.brands.creditReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={btn} disabled={pending || !amount || !reason.trim()}
        onClick={() => window.confirm(tk("admin.brands.creditAsk", { n: krw(amount) })) && run(() => adjustBrandCredit(brandId, { amount, reason }), (r) => {
          setMsg(tk("admin.brands.creditDone", { n: krw((r.data as { applied: number }).applied) }));
          setAmount(0); setReason("");
        })}>{tk("admin.brands.creditApply")}</button>
      {msg && <span className="text-meta text-ink-2">{msg}</span>}
    </div>
  );
}

export function StatusToggle({ brandId, status }: { brandId: string; status: string }) {
  const { pending, msg, run } = useRun();
  const next = status === "active" ? "suspended" : "active";
  return (
    <span className="flex items-center gap-2">
      <span className={`text-meta ${status === "suspended" ? "text-crit" : "text-ink-2"}`}>{tk(`admin.brands.status.${status}`)}</span>
      <button className={`btn btn-sm ${next === "suspended" ? "btn-ghost text-crit" : "btn-secondary"}`} disabled={pending}
        onClick={() => window.confirm(tk(`admin.brands.statusAsk.${next}`)) && run(() => setBrandStatus(brandId, next))}>{tk(`admin.brands.toStatus.${next}`)}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </span>
  );
}

export function InviteForm({ brandId }: { brandId: string }) {
  const { pending, msg, setMsg, run } = useRun();
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"owner" | "member">("member");
  const [canPurchase, setCanPurchase] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 text-body">
      <input aria-label={tk("admin.brands.emailPlaceholder")} className={`${field} w-56`} type="email" maxLength={120} placeholder={tk("admin.brands.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <select className={field} aria-label={tk("a11y.memberLevel")} value={level} onChange={(e) => setLevel(e.target.value as "owner" | "member")}>
        {(["member", "owner"] as const).map((l) => <option key={l} value={l}>{tk(`admin.brands.level.${l}`)}</option>)}
      </select>
      {level === "member" && <label className="flex items-center gap-1 text-meta"><input type="checkbox" checked={canPurchase} onChange={(e) => setCanPurchase(e.target.checked)} />{tk("admin.brands.canPurchase")}</label>}
      <button className={btn} disabled={pending || !/.+@.+\..+/.test(email)}
        onClick={() => run(() => inviteBrandMember(brandId, { email, level, canPurchase }), (r) => {
          const d = r.data as { url: string; emailed: boolean };
          setMsg(d.emailed ? tk("admin.brands.inviteSent") : tk("admin.brands.inviteLink", { url: d.url }));
          setEmail("");
        })}>{tk("admin.brands.invite")}</button>
      {msg && <span className="break-all text-meta text-ink-2">{msg}</span>}
    </div>
  );
}

export function SlugRequestDecision({ req, from }: { req: { id: string; value: string }; from: string }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-ui border border-warn bg-warn-soft px-4 py-3 text-body">
      <span className="num">{tk("admin.brands.slugRequest", { from, to: req.value })}</span>
      <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.brands.slugAsk")) && run(() => decideSlugRequest(req.id, true))}>{tk("admin.brands.slugApprove")}</button>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => decideSlugRequest(req.id, false))}>{tk("admin.brands.slugReject")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}
