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
const btn = "btn sm";

type Application = { id: string; brand_name: string; type: string; channels: string[]; follower_scale: string | null; contact_name: string; contact_email: string; contact_phone: string | null; biz_reg_no: string | null; is_ecommerce_registered: boolean | null; cn_content_optin: boolean; note: string | null; created_at: string };

/**
 * 대기 중 신청 목록(룰 섹션). 승인하면 서버 액션의 revalidate로 그 신청이 목록에서 빠지는데, 메일 키가 없을 때 **초대 링크가 대표를 초대할 유일한 수단**이다.
 * 그래서 이 목록(항상 마운트)이 승인된 행을 "확인"을 누를 때까지 붙잡아 둔다 — 행 컴포넌트 안의 상태는 행과 함께 사라지기 때문.
 */
export function ApplicationList({ apps }: { apps: Application[] }) {
  const router = useRouter();
  const [kept, setKept] = useState<{ a: Application; msg: string }[]>([]);
  const keptIds = new Set(kept.map((k) => k.a.id));
  const rows = apps.filter((a) => !keptIds.has(a.id));
  if (!rows.length && !kept.length) return null;
  return (
    <section>
      <header className="section-h">
        <h2>{tk("admin.brands.applications")}<span className="count num">{rows.length}</span></h2>
      </header>
      <ul>
        {kept.map(({ a, msg }) => (
          <li key={a.id} className="space-y-3 border-b border-line py-5 text-body">
            <span className="text-lead font-medium">{a.brand_name}</span>
            <p className="break-all bg-signature-soft px-4 py-3 text-meta text-signature">{msg}</p>
            <button className="btn sec sm" onClick={() => { setKept((k) => k.filter((x) => x.a.id !== a.id)); router.refresh(); }}>{tk("admin.brands.inviteDone")}</button>
          </li>
        ))}
        {rows.map((a) => (
          <li key={a.id} className="border-b border-line py-5">
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
    <div className="space-y-3 text-body">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lead font-medium">{a.brand_name}</span>
          {a.cn_content_optin && <span className="chip">{tk("admin.brands.cnOptin")}</span>}
        </div>
        <div className="meta mt-1">
          {[tk(`apply.type.${a.type}`), a.follower_scale ? tk(`apply.scale.${a.follower_scale}`) : null, a.contact_name, a.contact_email, a.contact_phone].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {a.channels.map((c) => <a key={c} href={c} target="_blank" rel="noreferrer noopener" className="link break-all">{c}</a>)}
      </div>
      {a.note && <p className="whitespace-pre-wrap text-meta text-ink-2">{a.note}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <span className="num pb-3 text-meta text-muted">/b/</span>
        <input className="field num w-44" aria-label={tk("a11y.slug")} value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        <button className={btn} disabled={pending || !/^[a-z0-9-]{3,40}$/.test(slug)}
          onClick={() => run(() => approveApplication(a.id, { slug }), (r) => {
            const d = r.data as { brandId: string; url: string; emailed: boolean; inviteFailed: boolean };
            if (d.emailed && !d.inviteFailed) return;
            // 메일이 안 나갔으면 이 링크가 대표를 초대할 유일한 수단 — 목록(ApplicationList)이 "확인"까지 붙잡아 둔다
            onKeep(d.inviteFailed ? tk("admin.brands.inviteRetry", { path: `/admin/brands/${d.brandId}` }) : tk("admin.brands.inviteLink", { url: d.url }));
            return false;
          })}>{tk("admin.brands.approve")}</button>
        <button className="btn sec sm" disabled={pending} onClick={() => window.confirm(tk("admin.brands.rejectAsk")) && run(() => rejectApplication(a.id))}>{tk("admin.brands.reject")}</button>
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
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 text-body">
      <label className="field w-32"><span className="lbl">{tk("admin.brands.tier")}</span>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          {["new", "proven"].map((t) => <option key={t} value={t}>{tk(`admin.brands.tier.${t}`)}</option>)}
        </select>
      </label>
      <label className="field w-24"><span className="lbl">{tk("admin.brands.fee")} %</span><input className="num" inputMode="decimal" placeholder={tk("admin.brands.default")} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
      <label className="field w-24"><span className="lbl">{tk("admin.brands.margin")} %</span><input className="num" inputMode="decimal" placeholder={tk("admin.brands.default")} value={margin} onChange={(e) => setMargin(e.target.value)} /></label>
      <button className={btn} disabled={pending || bad} onClick={() => window.confirm(tk("admin.brands.termsAsk")) && run(() => updateBrandTerms(p.brandId, { tier, feeRate: rate(fee), hiddenMarginRate: rate(margin) }))}>{tk("common.save")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
      {/* 조건 변경은 재발행부터 — 이미 발행된 제안은 발행 시점 요율로 고정 (절대 규칙 3, DECISIONS r7-11) */}
      <p className="basis-full text-caption text-muted">{tk("admin.brands.termsNote", { n: p.liveOffers })}</p>
    </div>
  );
}

export function CreditForm({ brandId }: { brandId: string }) {
  const { pending, msg, setMsg, run } = useRun();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-body">
      <input aria-label={tk("admin.brands.creditPlaceholder")} className="field num w-28" inputMode="numeric" value={amount || ""} placeholder={tk("admin.brands.creditPlaceholder")} onChange={(e) => setAmount(Math.trunc(Number(e.target.value.replace(/[^0-9-]/g, "")) || 0))} />
      <input aria-label={tk("admin.brands.creditReason")} className="field min-w-32 flex-1" maxLength={200} placeholder={tk("admin.brands.creditReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={btn} disabled={pending || !amount || !reason.trim()}
        onClick={() => window.confirm(tk("admin.brands.creditAsk", { n: krw(amount) })) && run(() => adjustBrandCredit(brandId, { amount, reason }), (r) => {
          setMsg(tk("admin.brands.creditDone", { n: krw((r.data as { applied: number }).applied) }));
          setAmount(0); setReason("");
        })}>{tk("admin.brands.creditApply")}</button>
      {msg && <span className="basis-full text-meta text-ink-2">{msg}</span>}
    </div>
  );
}

export function StatusToggle({ brandId, status }: { brandId: string; status: string }) {
  const { pending, msg, run } = useRun();
  const next = status === "active" ? "suspended" : "active";
  return (
    <span className="flex items-center gap-4">
      <span className={`st ${status === "suspended" ? "crit" : ""}`}>{tk(`admin.brands.status.${status}`)}</span>
      <button className={next === "suspended" ? "text-meta text-ink-2 underline-offset-4 hover:text-crit hover:underline" : "btn sec sm"} disabled={pending}
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
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-body">
      <input aria-label={tk("admin.brands.emailPlaceholder")} className="field w-56" type="email" maxLength={120} placeholder={tk("admin.brands.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <select className="field w-28" aria-label={tk("a11y.memberLevel")} value={level} onChange={(e) => setLevel(e.target.value as "owner" | "member")}>
        {(["member", "owner"] as const).map((l) => <option key={l} value={l}>{tk(`admin.brands.level.${l}`)}</option>)}
      </select>
      {level === "member" && <label className="flex h-11 items-center gap-2 text-meta"><input type="checkbox" checked={canPurchase} onChange={(e) => setCanPurchase(e.target.checked)} />{tk("admin.brands.canPurchase")}</label>}
      <button className={btn} disabled={pending || !/.+@.+\..+/.test(email)}
        onClick={() => run(() => inviteBrandMember(brandId, { email, level, canPurchase }), (r) => {
          const d = r.data as { url: string; emailed: boolean };
          setMsg(d.emailed ? tk("admin.brands.inviteSent") : tk("admin.brands.inviteLink", { url: d.url }));
          setEmail("");
        })}>{tk("admin.brands.invite")}</button>
      {msg && <span className="basis-full break-all text-meta text-ink-2">{msg}</span>}
    </div>
  );
}

/** 주소 변경 요청 — 결정이 필요한 한 줄(왼쪽 warn 룰, 상자 없음) */
export function SlugRequestDecision({ req, from }: { req: { id: string; value: string }; from: string }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-4 border-y border-l-2 border-line border-l-warn py-4 pl-5 text-body">
      <span className="num flex-1">{tk("admin.brands.slugRequest", { from, to: req.value })}</span>
      <button className={btn} disabled={pending} onClick={() => window.confirm(tk("admin.brands.slugAsk")) && run(() => decideSlugRequest(req.id, true))}>{tk("admin.brands.slugApprove")}</button>
      <button className="btn sec sm" disabled={pending} onClick={() => run(() => decideSlugRequest(req.id, false))}>{tk("admin.brands.slugReject")}</button>
      {msg && <span className="text-meta text-crit">{msg}</span>}
    </div>
  );
}
