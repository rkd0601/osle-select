"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import { setVendorWebhook } from "./actions";

const input = "field";

/** A-08 원청별 WeCom 웹훅 (DECISIONS r6-4). 쓰기 전용 — 저장된 키는 화면에 내려오지 않고 "설정됨"만 보인다. */
export function WebhookForm({ vendorId, isSet }: { vendorId: string; isSet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = (value: string | null) =>
    start(async () => {
      setMsg(null);
      const res = await setVendorWebhook(vendorId, value);
      setMsg(tk(res.ok ? "common.saved" : res.error));
      if (res.ok) {
        setUrl("");
        router.refresh();
      }
    });
  return (
    <div className="space-y-3 text-body">
      <div className="flex flex-wrap items-baseline gap-4">
        <span className="font-medium">{tk("admin.vendors.wecom")}</span>
        <span className={`st ${isSet ? "done" : "warn"}`}>{tk(isSet ? "admin.vendors.wecomSet" : "admin.vendors.wecomUnset")}</span>
      </div>
      <p className="text-caption text-muted">{tk("admin.vendors.wecomHelp")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <input aria-label={tk("admin.vendors.wecom")} className={`${input} max-w-xl flex-1`} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn sm" disabled={pending || !url.trim()} onClick={() => save(url.trim())}>{tk("common.save")}</button>
        {isSet && <button className="btn sec sm" disabled={pending} onClick={() => save(null)}>{tk("admin.vendors.wecomClear")}</button>}
        {msg && <span className="text-meta text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
