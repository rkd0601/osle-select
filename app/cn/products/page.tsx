import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listMyProducts } from "@/lib/db/cn/products";
import { getRejectionTemplates } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { StatusPill } from "@/components/domain/status-pill";
import { fmtDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { PRODUCT_STATUS } from "@/lib/transitions";

const TABS = ["", "draft", "pending_review", "rejected", "reviewed", "offering", "repool", "recheck"] as const;

/** C-04 내 상품 · 상태. 반려 사유는 템플릿 문구(zh/ko), 재확인 사유 표시. 빠른 수정은 C-03으로. */
export default async function CnProducts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/products");
  const L = u.locale;
  const { status } = await searchParams;
  const filter = (PRODUCT_STATUS as readonly string[]).includes(status ?? "") ? status : undefined;
  const [rows, templates] = await Promise.all([listMyProducts({ id: u.id, role: u.role }, filter), getRejectionTemplates()]);
  const covers = await signedReadUrls("productImages", rows.flatMap((r) => (r.cover ? [r.cover] : [])));
  const reason = (code: string) => {
    const tpl = templates.find((x) => x.code === code);
    return tpl ? (L === "ko" ? tpl.ko : tpl.zh) : code;
  };
  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="text-[20px] font-bold">{t(L, "product.list.title")}</h1>
        <Link href="/cn/products/new" className="bg-ink px-3 py-1.5 text-[13px] text-paper">{t(L, "cn.nav.new")}</Link>
      </div>
      <nav className="mt-3 flex flex-wrap gap-1 border-b border-line text-[12px]">
        {TABS.map((tab) => (
          <Link key={tab || "all"} href={tab ? `/cn/products?status=${tab}` : "/cn/products"} className={`px-3 py-2 ${(filter ?? "") === tab ? "border-b-2 border-ink font-semibold" : "text-ink-2"}`}>
            {tab ? t(L, `status.product.${tab}`) : t(L, "product.list.all")}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="py-10 text-[13px] text-muted">{t(L, "product.list.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line bg-surface">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/cn/products/${p.id}`} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 px-3 py-2.5 hover:bg-paper">
                {p.cover && covers[p.cover] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                  <img src={covers[p.cover]} alt="" className="aspect-[3/4] w-14 bg-sand object-cover" />
                ) : (
                  <span className="aspect-[3/4] w-14 bg-sand" />
                )}
                <div className="min-w-0 text-[13px]">
                  <div className="truncate font-medium">{p.name_zh || p.code || p.id.slice(0, 8)}</div>
                  <div className="num text-[11px] text-muted">{[p.code, p.category, t(L, "product.list.photos", { n: p.photoCount }), fmtDate(p.updated_at, L)].filter(Boolean).join(" · ")}</div>
                  {p.status === "rejected" && p.rejected_reasons?.length > 0 && (
                    <div className="mt-0.5 text-[12px] text-warn">{t(L, "product.list.rejected")}: {p.rejected_reasons.map(reason).join(" · ")}</div>
                  )}
                  {p.status === "recheck" && p.recheck_reason && <div className="mt-0.5 text-[12px] text-warn">{t(L, "product.list.recheck", { reason: p.recheck_reason.split(",").map((f: string) => t(L, `product.field.${f}`)).join(" · ") })}</div>}
                </div>
                <StatusPill entity="product" status={p.status} locale={L} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
