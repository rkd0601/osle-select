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
import { PageHeader } from "@/components/domain/page-header";
import { fmtDate, isOverdue } from "@/lib/format";
import { t } from "@/lib/i18n/cn";
import { t as tSourcer } from "@/lib/i18n/cn-sourcer";
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
  // 목표 원가는 소싱 담당·ADMIN만 (PRD 2장, DECISIONS 11-4) — 원청(CN_VENDOR)은 뷰가 희망 단가를 가리지만 코드도 한 번 더
  const cny = item.target_price_krw && u.role !== "CN_VENDOR"
    ? targetCostCny(item.target_price_krw, { fx_rate: settings.fx_rate_cny_krw, fee_rate: settings.fee_rate, hidden_margin_rate: settings.hidden_margin_rate })
    : null;
  const next = allowedNext("request_item", item.status, u.role);

  return (
    <div>
      <Link href="/cn" className="inline-flex min-h-10 items-center text-meta text-ink-2 hover:text-ink">{t(L, "common.back")}</Link>
      <PageHeader
        eyebrow={[item.brand_label, item.category].filter(Boolean).join(" · ") || undefined}
        title={t(L, "cn.item.title", { seq: item.seq })}
        actions={<StatusPill entity="request_item" status={item.status} locale={L} />}
      />
      <p className="-mt-2 mb-5 whitespace-pre-wrap text-h4 font-medium leading-snug">{item.description_zh ?? t(L, "cn.item.noZh")}</p>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line text-body sm:grid-cols-4">
        <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{t(L, "cn.item.brand")}</dt><dd className="mt-1 font-medium">{item.brand_label}</dd></div>
        <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{t(L, "cn.item.qty")}</dt><dd className="num mt-1 font-medium">{item.expected_qty_range ? t(L, `qtyRange.${item.expected_qty_range}`) : "-"}</dd></div>
        <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{t(L, "cn.item.due")}</dt><dd className={`num mt-1 font-medium ${isOverdue(item.due_at) ? "font-semibold text-crit" : ""}`}>{fmtDate(item.due_at, L, true)}</dd></div>
        <div className="bg-surface px-4 py-3"><dt className="text-caption text-ink-2">{item.category ?? ""}</dt><dd className="num mt-1 text-h5 font-semibold">{cny !== null ? tSourcer(L, "cn.item.target", { cny }) : "-"}</dd></div>
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {item.request_memo_zh && (
            <section className="card px-4 py-4 md:px-5">
              <h2 className="eyebrow">{t(L, "cn.item.memo")}</h2>
              <p className="mt-2 whitespace-pre-wrap text-body">{item.request_memo_zh}</p>
            </section>
          )}

          <section>
            <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-2 text-h5 font-semibold">{t(L, "cn.item.refs")} <span className="num text-body font-normal text-ink-2">{images.length}</span></h2>
            {images.length === 0 && <p className="py-2 text-body text-ink-2">{t(L, "cn.tasks.none")}</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {images.map((img) =>
                img.storage_path ? (
                  <a key={img.id} href={urls[img.storage_path]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-ui hover:opacity-90">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL(같은 Supabase 오리진) */}
                    <img src={urls[img.storage_path]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
                  </a>
                ) : (
                  <a key={img.id} href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="col-span-3 break-all rounded-ui border border-line bg-surface px-3 py-2 text-meta underline sm:col-span-2">{img.source_url}</a>
                ),
              )}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <CnItemActions itemId={item.id} canStart={next.includes("sourcing")} canAsk={item.status === "assigned" || item.status === "sourcing"} locale={L} />
        </aside>
      </div>

      {questions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-2 text-h5 font-semibold">{t(L, "cn.item.questions")} <span className="num text-body font-normal text-ink-2">{questions.length}</span></h2>
          <ul className="card divide-y divide-line text-body">
            {questions.map((q) => {
              const answer = q.answer_zh || q.answer;
              return (
                <li key={q.id} className="px-4 py-3">
                  <p className="font-medium">{q.body_zh}</p>
                  {answer ? (
                    <p className="mt-1.5 border-l-2 border-signature pl-2 text-meta text-ink-2">{t(L, "cn.item.answer")}: {answer}</p>
                  ) : !q.released_at ? (
                    <p className="mt-1.5 text-meta text-warn">{t(L, "cn.item.pending")}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* 위아더 ↔ 중국 담당 (브랜드는 못 본다). 위아더가 쓴 한국어는 자동 번역 + 원문 병기 */}
      <div className="mt-8">
        <CommentThread targetType="request_item" targetId={id} viewer="cn" tabs={["cn"]} rows={thread} locale={L} />
      </div>
    </div>
  );
}
