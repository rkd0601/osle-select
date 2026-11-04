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
import { CnItemActions, CnItemAsk } from "./item-actions";
import { CommentThread } from "@/components/domain/comment-thread";
import { cnThread } from "@/lib/db/comments";

/**
 * C-01 항목 상세 (zh-CN). 배정 안 된 항목·없는 id는 404. 외부 리소스 없음(CLAUDE.md 규칙 9).
 * 목표 진가는 CN_SOURCER에게만 (뷰가 VENDOR에겐 target_price_krw를 null로 준다).
 * 디자인 v2: 760 한 칸 — 머리 → 설명 → 룰 사이 값(.kv) → 버튼 → 룰 섹션(메모·참고·질문·코멘트).
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
  const canAsk = item.status === "assigned" || item.status === "sourcing";
  const photos = images.filter((i) => i.storage_path);
  const links = images.filter((i) => !i.storage_path);

  return (
    <div>
      <Link href="/cn" className="-mt-2 mb-2 inline-flex min-h-10 items-center text-meta text-ink-2 hover:text-ink">{t(L, "common.back")}</Link>
      <PageHeader
        eyebrow={item.category || undefined}
        title={t(L, "cn.item.title", { seq: item.seq })}
        actions={<StatusPill entity="request_item" status={item.status} locale={L} />}
      />
      <p className="whitespace-pre-wrap text-h2 font-normal leading-snug">{item.description_zh ?? t(L, "cn.item.noZh")}</p>

      <dl className="kv mt-8">
        <div><dt className="label">{t(L, "cn.item.brand")}</dt><dd className="v" style={{ fontSize: "var(--fs-lead)" }}>{item.brand_label}</dd></div>
        <div><dt className="label">{t(L, "cn.item.qty")}</dt><dd className="v">{item.expected_qty_range ? t(L, `qtyRange.${item.expected_qty_range}`) : "-"}</dd></div>
        <div><dt className="label">{t(L, "cn.item.due")}</dt><dd className={`v ${isOverdue(item.due_at) ? "text-crit" : ""}`}>{fmtDate(item.due_at, L, true)}</dd></div>
      </dl>
      {cny !== null && <p className="num mt-3 text-meta text-ink-2">{tSourcer(L, "cn.item.target", { cny })}</p>}

      <CnItemActions itemId={item.id} canStart={next.includes("sourcing")} canAsk={canAsk} locale={L} />

      {item.request_memo_zh && (
        <section className="section">
          <div className="section-h"><h2>{t(L, "cn.item.memo")}</h2></div>
          <p className="whitespace-pre-wrap pt-4 text-body">{item.request_memo_zh}</p>
        </section>
      )}

      <section className="section">
        <div className="section-h"><h2>{t(L, "cn.item.refs")}<span className="count">{images.length}</span></h2></div>
        {images.length === 0 && <p className="pt-4 text-body text-ink-2">{t(L, "cn.tasks.none")}</p>}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-5 sm:grid-cols-4">
            {photos.map((img) => (
              <a key={img.id} href={urls[img.storage_path!]} target="_blank" rel="noreferrer" className="photo block hover:opacity-90">
                {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL(같은 Supabase 오리진) */}
                <img src={urls[img.storage_path!]} alt="" className="absolute inset-0 h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        {links.length > 0 && (
          <ul className="pt-3">
            {links.map((img) => (
              <li key={img.id} className="border-b border-line py-3">
                <a href={img.source_url ?? "#"} target="_blank" rel="noreferrer noopener" className="link break-all">{img.source_url}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canAsk && <CnItemAsk itemId={item.id} locale={L} />}

      {questions.length > 0 && (
        <section className="section">
          <div className="section-h"><h2>{t(L, "cn.item.questions")}<span className="count">{questions.length}</span></h2></div>
          <ul>
            {questions.map((q) => {
              const answer = q.answer_zh || q.answer;
              return (
                <li key={q.id} className="border-b border-line py-4">
                  <p className="text-body font-medium">{q.body_zh}</p>
                  {answer ? (
                    <p className="mt-1.5 text-meta text-ink-2">{t(L, "cn.item.answer")}: {answer}</p>
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
      <div className="section">
        <CommentThread targetType="request_item" targetId={id} viewer="cn" tabs={["cn"]} rows={thread} locale={L} />
      </div>
    </div>
  );
}
