import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getMyItem } from "@/lib/db/cn/requests";
import { getSettings } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { allowedNext } from "@/lib/transitions";
import { targetCostCny } from "@/lib/pricing";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";
import { CnItemActions } from "./item-actions";
import { CommentThread } from "@/components/domain/comment-thread";
import { cnThread } from "@/lib/db/comments";

/**
 * C-01 항목 상세 (zh-CN). 배정 안 된 항목·없는 id는 404. 외부 리소스 없음(CLAUDE.md 규칙 9).
 * 목표 진가는 CN_SOURCER에게만 (뷰가 VENDOR에겐 target_price_krw를 null로 준다).
 */
export default async function CnItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn");
  const L = u.locale;
  const data = await getMyItem(id);
  if (!data) notFound();
  const { item, images, questions } = data;
  const [urls, settings, thread] = await Promise.all([
    signedReadUrls("requestImages", images.flatMap((i) => (i.storage_path ? [i.storage_path] : []))),
    getSettings(),
    cnThread(u.id, "request_item", id),
  ]);
  const cny = item.target_price_krw
    ? targetCostCny(item.target_price_krw, { fx_rate: settings.fx_rate_cny_krw, fee_rate: settings.fee_rate, hidden_margin_rate: settings.hidden_margin_rate })
    : null;
  const next = allowedNext("request_item", item.status, u.role);

  return (
    <div className="space-y-6">
      <Link href="/cn" className="text-meta text-muted">{t(L, "common.back")}</Link>
      <div className="flex flex-wrap items-center gap-3 border-b border-ink pb-3">
        <h1 className="text-h2 font-bold">{t(L, "cn.item.title", { seq: item.seq })}</h1>
        <StatusPill entity="request_item" status={item.status} locale={L} />
      </div>
      <p className="text-h4 font-medium">{item.description_zh ?? t(L, "cn.item.noZh")}</p>

      <dl className="grid grid-cols-2 gap-px bg-line text-body sm:grid-cols-4">
        <div className="bg-surface p-3"><dt className="text-caption text-muted">{t(L, "cn.item.brand")}</dt><dd className="mt-1">{item.brand_label}</dd></div>
        <div className="bg-surface p-3"><dt className="text-caption text-muted">{t(L, "cn.item.qty")}</dt><dd className="num mt-1">{item.expected_qty_range ? t(L, `qtyRange.${item.expected_qty_range}`) : "-"}</dd></div>
        <div className="bg-surface p-3"><dt className="text-caption text-muted">{t(L, "cn.item.due")}</dt><dd className={`num mt-1 ${isOverdue(item.due_at) ? "font-semibold text-crit" : ""}`}>{fmtDate(item.due_at, L, true)}</dd></div>
        <div className="bg-surface p-3"><dt className="text-caption text-muted">{item.category ?? ""}</dt><dd className="num mt-1 font-semibold">{cny !== null ? t(L, "cn.item.target", { cny }) : "-"}</dd></div>
      </dl>

      {item.request_memo_zh && (
        <section>
          <h2 className="text-meta font-semibold text-ink-2">{t(L, "cn.item.memo")}</h2>
          <p className="mt-1 whitespace-pre-wrap text-body">{item.request_memo_zh}</p>
        </section>
      )}

      <section>
        <h2 className="text-meta font-semibold text-ink-2">{t(L, "cn.item.refs")}</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {images.map((img) =>
            img.storage_path ? (
              <a key={img.id} href={urls[img.storage_path]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL(같은 Supabase 오리진) */}
                <img src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
              </a>
            ) : (
              <a key={img.id} href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="col-span-3 break-all text-meta underline sm:col-span-2">{img.source_url}</a>
            ),
          )}
        </div>
      </section>

      <CnItemActions itemId={item.id} canStart={next.includes("sourcing")} canAsk={item.status === "assigned" || item.status === "sourcing"} locale={L} />

      {questions.length > 0 && (
        <section>
          <h2 className="text-meta font-semibold text-ink-2">{t(L, "cn.item.questions")}</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line bg-surface text-body">
            {questions.map((q) => (
              <li key={q.id} className="px-3 py-2">
                <p>{q.body_zh}</p>
                <p className="mt-1 text-meta text-ink-2">
                  {q.answer_zh || q.answer ? `${t(L, "cn.item.answer")}: ${q.answer_zh ?? q.answer}` : q.released_at ? "" : t(L, "cn.item.pending")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* 위아더 ↔ 중국 담당 (브랜드는 못 본다). 위아더가 쓴 한국어는 자동 번역 + 원문 병기 */}
      <CommentThread targetType="request_item" targetId={id} viewer="cn" tabs={["cn"]} rows={thread} locale={L} />
    </div>
  );
}
