"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/cn";
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

  if (!canStart && !canAsk && !msg) return null;
  return (
    <div className="card overflow-hidden">
      {(canStart || canAsk) && (
        <div className="flex flex-col gap-2 p-4">
          {canStart && (
            <button disabled={pending} onClick={() => run(() => startSourcing(itemId))} className="btn btn-primary btn-lg min-h-11 w-full">
              {t(locale, "cn.item.start")}
            </button>
          )}
          {canAsk && (
            <Link href={`/cn/products/new?item=${itemId}`} className={`btn btn-lg min-h-11 w-full ${canStart ? "btn-secondary" : "btn-accent"}`}>{t(locale, "cn.item.addProduct")}</Link>
          )}
        </div>
      )}
      {canAsk && (
        <div className="space-y-2 border-t border-line bg-paper/60 p-4" lang="zh-CN">
          <h2 className="text-body font-semibold">{t(locale, "cn.item.ask")}</h2>
          <textarea aria-label={t(locale, "cn.item.ask.ph")} className="field min-h-20" maxLength={500} placeholder={t(locale, "cn.item.ask.ph")} value={body} onChange={(e) => setBody(e.target.value)} />
          <textarea aria-label={t(locale, "cn.item.ask.options")} className="field" rows={2} placeholder={t(locale, "cn.item.ask.options")} value={options} onChange={(e) => setOptions(e.target.value)} />
          <p className="text-caption text-ink-2">{t(locale, "cn.item.ask.gate")}</p>
          <button
            disabled={pending || !body.trim()}
            onClick={() =>
              run(
                () => askBrand(itemId, { bodyZh: body, options: options.split("\n").map((s) => s.trim()).filter(Boolean) }),
                () => { setBody(""); setOptions(""); },
              )
            }
            className="btn btn-secondary min-h-10 w-full"
          >
            {t(locale, "cn.item.ask.submit")}
          </button>
        </div>
      )}
      {msg && <p role="alert" className="border-t border-line px-4 py-2 text-meta text-crit">{msg}</p>}
    </div>
  );
}
