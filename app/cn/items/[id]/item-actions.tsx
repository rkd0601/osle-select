"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/cn";
import { askBrand, startSourcing } from "../actions";

type Res = { ok: true } | { ok: false; error: string };

function useRun(locale: Locale) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) return setMsg(t(locale, res.error));
      after?.();
      router.refresh();
    });
  return { pending, msg, run };
}

/** C-01 행위: 开始寻找(assigned → sourcing) · 添加商品(C-02, 요청 연결 자동). 버튼 줄(모바일 전폭) */
export function CnItemActions({ itemId, canStart, canAsk, locale }: { itemId: string; canStart: boolean; canAsk: boolean; locale: Locale }) {
  const { pending, msg, run } = useRun(locale);
  if (!canStart && !canAsk && !msg) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {canStart && (
        <button disabled={pending} onClick={() => run(() => startSourcing(itemId))} className="btn lg max-sm:w-full">{t(locale, "cn.item.start")}</button>
      )}
      {canAsk && (
        <Link href={`/cn/products/new?item=${itemId}`} className={`btn lg max-sm:w-full ${canStart ? "sec" : ""}`}>{t(locale, "cn.item.addProduct")}</Link>
      )}
      {msg && <p role="alert" className="w-full text-meta text-crit">{msg}</p>}
    </div>
  );
}

/** C-01 向品牌提问(4시간 관리자 게이트) — 룰 섹션 + 밑줄 입력 + 보조 버튼 */
export function CnItemAsk({ itemId, locale }: { itemId: string; locale: Locale }) {
  const { pending, msg, run } = useRun(locale);
  const [body, setBody] = useState("");
  const [options, setOptions] = useState("");
  return (
    <section className="section" lang="zh-CN">
      <div className="section-h"><h2>{t(locale, "cn.item.ask")}</h2></div>
      <div className="space-y-5 pt-5">
        <textarea aria-label={t(locale, "cn.item.ask.ph")} className="field" maxLength={500} placeholder={t(locale, "cn.item.ask.ph")} value={body} onChange={(e) => setBody(e.target.value)} />
        <textarea aria-label={t(locale, "cn.item.ask.options")} className="field" rows={2} placeholder={t(locale, "cn.item.ask.options")} value={options} onChange={(e) => setOptions(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-5">
        <p className="text-caption text-muted">{t(locale, "cn.item.ask.gate")}</p>
        <button
          disabled={pending || !body.trim()}
          onClick={() =>
            run(
              () => askBrand(itemId, { bodyZh: body, options: options.split("\n").map((s) => s.trim()).filter(Boolean) }),
              () => { setBody(""); setOptions(""); },
            )
          }
          className="btn sec max-sm:w-full"
        >
          {t(locale, "cn.item.ask.submit")}
        </button>
      </div>
      {msg && <p role="alert" className="pt-2 text-meta text-crit">{msg}</p>}
    </section>
  );
}
