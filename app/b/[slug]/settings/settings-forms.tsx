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
    <li className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3 text-body">
      <span className="min-w-0 flex-1 basis-48">
        <span className="block text-lead font-medium">{m.name || m.email}{m.profileId === me && <span className="ml-2 text-caption font-normal text-muted">{tk("bsettings.you")}</span>}</span>
        <span className="block break-all text-meta text-muted">{m.email}</span>
      </span>
      <span className="text-meta text-ink-2">{tk(m.level === "owner" ? "bsettings.owner" : "bsettings.member")}</span>
      <label className="flex min-h-11 items-center gap-2 text-meta">
        <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={m.level === "owner" || m.canPurchase} disabled={!editable || pending} onChange={(e) => run(() => setMemberPurchase(brandId, m.profileId, e.target.checked))} />
        {tk("bsettings.canPurchase")}
      </label>
      {editable && <button className="min-h-11 text-meta text-ink-2 hover:text-crit" disabled={pending} onClick={() => window.confirm(tk("bsettings.removeAsk")) && run(() => removeMember(brandId, m.profileId), () => null)}>{tk("bsettings.remove")}</button>}
      <Msg m={msg} />
    </li>
  );
}

export function InviteMemberForm({ brandId }: { brandId: string }) {
  const { pending, msg, run } = useRun();
  const [email, setEmail] = useState("");
  const [canPurchase, setCanPurchase] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-body">
      <input className="field w-full sm:w-72" type="email" maxLength={120} placeholder={tk("bsettings.inviteEmail")} aria-label={tk("bsettings.inviteEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="flex min-h-11 items-center gap-2 text-meta"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={canPurchase} onChange={(e) => setCanPurchase(e.target.checked)} />{tk("bsettings.canPurchase")}</label>
      <button className={btn} disabled={pending || !/.+@.+\..+/.test(email)} onClick={() => run(() => inviteMember(brandId, { email, canPurchase }), (r) => {
        const d = r.data as { url: string; emailed: boolean };
        setEmail("");
        return d.emailed ? tk("bsettings.invited") : tk("bsettings.inviteLink", { url: d.url });
      })}>{tk("bsettings.inviteSend")}</button>
      <Msg m={msg} />
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
    <div className="flex max-w-xl flex-col gap-7 text-body">
      <div className="grid grid-cols-2 gap-7">
        <label className="field text-caption text-muted">{tk("bsettings.addr.recipient")}<input maxLength={40} value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></label>
        <label className="field text-caption text-muted">{tk("bsettings.addr.phone")}<input className="num" maxLength={30} inputMode="tel" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} /></label>
      </div>
      <label className="field text-caption text-muted">{tk("bsettings.addr.line1")}<input maxLength={200} value={a.address} onChange={(e) => setA({ ...a, address: e.target.value })} /></label>
      <label className="field text-caption text-muted">{tk("bsettings.addr.memo")}<input maxLength={100} value={a.memo} onChange={(e) => setA({ ...a, memo: e.target.value })} /></label>
      <div className="flex items-center gap-4">
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
        <div className="flex flex-wrap items-end gap-3">
          <span className="num pb-3 text-meta text-muted">/b/</span>
          <input className="field num w-48" maxLength={40} value={v} onChange={(e) => setV(e.target.value.toLowerCase())} aria-label={tk("bsettings.slug")} placeholder={tk("bsettings.slugRule")} title={tk("bsettings.slugRule")} />
          <button className="btn sec" disabled={pending || !/^[a-z0-9-]{3,40}$/.test(v) || v === slug} onClick={() => run(() => requestSlugChange(brandId, v), () => { setV(""); return null; })}>{tk("bsettings.slugRequest")}</button>
        </div>
      )}
      <p className="text-caption text-muted">{tk("bsettings.slugHelp")}</p>
      <Msg m={msg} />
    </div>
  );
}
