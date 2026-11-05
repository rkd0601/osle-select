"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { cancelSlugRequest, inviteMember, removeMember, requestSlugChange, setDigest, setMemberPurchase, updateDefaultAddress } from "./actions";

type R = { ok: true; data?: unknown } | { ok: false; error: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<R>, okText?: (r: R & { ok: true }) => string | null) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok) return setMsg({ ok: false, text: tk(r.error) });
    const t = okText ? okText(r) : tk("bsettings.saved");
    if (t) setMsg({ ok: true, text: t });
    router.refresh();
  });
  return { pending, msg, run };
}
const btn = "btn";
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? <span className={`break-all text-meta ${m.ok ? "text-ink-2" : "text-crit"}`}>{m.text}</span> : null);

type Member = { profileId: string; level: "owner" | "member"; canPurchase: boolean; name: string; email: string };
export function MemberRow({ brandId, m, isOwner, me }: { brandId: string; m: Member; isOwner: boolean; me: string }) {
  const { pending, msg, run } = useRun();
  const editable = isOwner && m.level === "member" && m.profileId !== me;
  return (
    <li className="grid min-h-16 grid-cols-8 items-center gap-x-6 gap-y-2 border-b border-line py-3 text-body">
      {/* 8칸 소그리드: 이름·이메일 4 · 역할 1 · 발주 권한 2 · 내보내기 1(우정렬) — 체크박스가 행마다 같은 선(L11) */}
      <span className="col-span-8 min-w-0 sm:col-span-4">
        <span className="block text-lead font-medium">{m.name || m.email}{m.profileId === me && <span className="ml-2 text-caption font-normal text-muted">{tk("bsettings.you")}</span>}</span>
        <span className="block break-all text-meta text-muted">{m.email}</span>
      </span>
      <span className="col-span-2 text-meta text-ink-2 sm:col-span-1">{tk(m.level === "owner" ? "bsettings.owner" : "bsettings.member")}</span>
      <label className="col-span-4 flex min-h-11 items-center gap-2 text-meta sm:col-span-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={m.level === "owner" || m.canPurchase} disabled={!editable || pending} onChange={(e) => run(() => setMemberPurchase(brandId, m.profileId, e.target.checked))} />
        {tk("bsettings.canPurchase")}
      </label>
      {editable && <button className="col-span-2 min-h-11 justify-self-end text-meta text-ink-2 hover:text-crit sm:col-span-1" disabled={pending} onClick={() => window.confirm(tk("bsettings.removeAsk")) && run(() => removeMember(brandId, m.profileId), () => null)}>{tk("bsettings.remove")}</button>}
      {msg && <span className="col-span-8"><Msg m={msg} /></span>}
    </li>
  );
}

export function InviteMemberForm({ brandId }: { brandId: string }) {
  const { pending, msg, run } = useRun();
  const [email, setEmail] = useState("");
  const [canPurchase, setCanPurchase] = useState(false);
  return (
    <div className="grid grid-cols-8 items-end gap-x-6 gap-y-3 text-body">
      {/* 이메일 4 · 발주 권한 2 · 초대 2(L11) */}
      <input className="field col-span-8 sm:col-span-4" type="email" maxLength={120} placeholder={tk("bsettings.inviteEmail")} aria-label={tk("bsettings.inviteEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="col-span-4 flex min-h-11 items-center gap-2 text-meta sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={canPurchase} onChange={(e) => setCanPurchase(e.target.checked)} />{tk("bsettings.canPurchase")}</label>
      <button className={`${btn} col-span-4 w-full sm:col-span-2`} disabled={pending || !/.+@.+\..+/.test(email)} onClick={() => run(() => inviteMember(brandId, { email, canPurchase }), (r) => {
        const d = r.data as { url: string; emailed: boolean };
        setEmail("");
        return d.emailed ? tk("bsettings.invited") : tk("bsettings.inviteLink", { url: d.url });
      })}>{tk("bsettings.inviteSend")}</button>
      {msg && <span className="col-span-8"><Msg m={msg} /></span>}
    </div>
  );
}

type Addr = { name: string; phone: string; address: string; memo: string };
export function AddressForm({ brandId, value, canEdit }: { brandId: string; value: Partial<Addr> | null; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const [a, setA] = useState<Addr>({ name: value?.name ?? "", phone: value?.phone ?? "", address: value?.address ?? "", memo: value?.memo ?? "" });
  if (!canEdit) return value?.address ? <p className="text-body">{value.name} · {value.phone}<br />{value.address}{value.memo ? ` · ${value.memo}` : ""}</p> : <p className="text-body text-ink-2">{tk("bsettings.addressNone")}</p>;
  const ok = a.name.trim() && a.phone.trim().length >= 5 && a.address.trim().length >= 5;
  return (
    <div className="flex flex-col gap-8 text-body">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8">
        <label className="field text-caption text-muted">{tk("bsettings.addr.recipient")}<input maxLength={40} value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></label>
        <label className="field text-caption text-muted">{tk("bsettings.addr.phone")}<input className="num" maxLength={30} inputMode="tel" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} /></label>
      </div>
      <label className="field text-caption text-muted">{tk("bsettings.addr.line1")}<input maxLength={200} value={a.address} onChange={(e) => setA({ ...a, address: e.target.value })} /></label>
      <label className="field text-caption text-muted">{tk("bsettings.addr.memo")}<input maxLength={100} value={a.memo} onChange={(e) => setA({ ...a, memo: e.target.value })} /></label>
      <div className="flex items-center gap-6">
        <button className={btn} disabled={pending || !ok} onClick={() => run(() => updateDefaultAddress(brandId, a))}>{tk("common.save")}</button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

export function DigestToggle({ brandId, on, disabled }: { brandId: string; on: boolean; disabled: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-2 text-body">
      <label className="flex min-h-11 items-center gap-2.5">
        <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={on} disabled={disabled || pending} onChange={(e) => run(() => setDigest(brandId, e.target.checked))} />
        {tk("bsettings.digest")}
      </label>
      <p className="text-caption text-muted">{tk(disabled ? "bsettings.digestOnBehalf" : "bsettings.digestHelp")}</p>
      <Msg m={msg} />
    </div>
  );
}

export function SlugForm({ brandId, slug, pendingSlug, canEdit }: { brandId: string; slug: string; pendingSlug: string | null; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const [v, setV] = useState("");
  return (
    <div className="space-y-3 text-body">
      <p className="num text-lead"><span className="text-muted">/b/</span>{slug}</p>
      {pendingSlug ? (
        <p className="flex flex-wrap items-center gap-4 text-ink-2">
          {tk("bsettings.slugPending", { slug: pendingSlug })}
          {canEdit && <button className="min-h-11 text-meta text-ink-2 hover:text-crit" disabled={pending} onClick={() => run(() => cancelSlugRequest(brandId), () => null)}>{tk("bsettings.slugCancel")}</button>}
        </p>
      ) : canEdit && (
        <div className="grid grid-cols-4 items-end gap-x-6 gap-y-3">
          {/* 입력 2칸 · 변경 요청 2칸(L11). 현재 주소(/b/…)는 바로 위 줄 */}
          <input className="field num col-span-4 sm:col-span-2" maxLength={40} value={v} onChange={(e) => setV(e.target.value.toLowerCase())} aria-label={tk("bsettings.slug")} placeholder={tk("bsettings.slugRule")} title={tk("bsettings.slugRule")} />
          <button className="btn sec col-span-4 w-full sm:col-span-2" disabled={pending || !/^[a-z0-9-]{3,40}$/.test(v) || v === slug} onClick={() => run(() => requestSlugChange(brandId, v), () => { setV(""); return null; })}>{tk("bsettings.slugRequest")}</button>
        </div>
      )}
      <p className="text-caption text-muted">{tk("bsettings.slugHelp")}</p>
      <Msg m={msg} />
    </div>
  );
}
