"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { askBrand, startSourcing } from "../actions";

/** C-01 행위: 开始寻找(assigned → sourcing) · 添加商品(C-02, 요청 연결 자동) · 向品牌提问(4시간 관리자 게이트). */
export function CnItemActions({ itemId, canStart, canAsk, locale }: { itemId: string; canStart: boolean; canAsk: boolean; locale: Locale }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [options, setOptions] = useState("");
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) return setMsg(t(locale, res.error));
      after?.();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canStart && (
          <button disabled={pending} onClick={() => run(() => startSourcing(itemId))} className="bg-ink px-4 py-2.5 text-lead font-medium text-paper disabled:opacity-40">
            {t(locale, "cn.item.start")}
          </button>
        )}
        {canAsk && (
          <Link href={`/cn/products/new?item=${itemId}`} className="border border-ink px-4 py-2.5 text-lead font-medium">{t(locale, "cn.item.addProduct")}</Link>
        )}
      </div>
      {canAsk && (
        <div className="space-y-2 bg-surface p-3" lang="zh-CN">
          <h2 className="text-meta font-semibold text-ink-2">{t(locale, "cn.item.ask")}</h2>
          <textarea className="w-full border border-line px-2 py-1.5 text-body" maxLength={500} placeholder={t(locale, "cn.item.ask.ph")} value={body} onChange={(e) => setBody(e.target.value)} />
          <textarea className="w-full border border-line px-2 py-1.5 text-body" rows={2} placeholder={t(locale, "cn.item.ask.options")} value={options} onChange={(e) => setOptions(e.target.value)} />
          <p className="text-caption text-muted">{t(locale, "cn.item.ask.gate")}</p>
          <button
            disabled={pending || !body.trim()}
            onClick={() =>
              run(
                () => askBrand(itemId, { bodyZh: body, options: options.split("\n").map((s) => s.trim()).filter(Boolean) }),
                () => { setBody(""); setOptions(""); },
              )
            }
            className="border border-ink px-3 py-1.5 text-body disabled:opacity-40"
          >
            {t(locale, "cn.item.ask.submit")}
          </button>
        </div>
      )}
      {msg && <p className="text-meta text-crit">{msg}</p>}
    </div>
  );
}
