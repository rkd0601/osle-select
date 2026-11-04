import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { listBillingOrders } from "@/lib/db/brand/billing";
import { listBrandSamples } from "@/lib/db/brand/samples";
import { listExportCandidates, listExportPackages } from "@/lib/db/brand/exports";
import { getBankAccount } from "@/lib/db/settings";
import { signedReadUrls } from "@/lib/storage";
import { orderStateKey } from "@/lib/brand-state";
import { fmtDay, krw } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { Photo } from "@/components/domain/photo";
import { ExportForm } from "../exports/export-form";
import { PackageRows } from "./package-rows";

/**
 * B-11 청구 (디자인 v2.2 "청구", DECISIONS d-6 — `/exports` 흡수). 12칸: "청구" / "쇼핑몰용 상품 파일" → 잉크 룰 →
 * 4칸 셋(청구 예정 · 납부한 선금 · 입금 계좌) → "발주 n" 표 다섯 열(상품 · 수량 · 청구 · 지금 · 내역) → "쇼핑몰용 상품 파일 n"(#packages).
 * 상품가·수수료·물류·선금 분해는 발주 상세 청구표에서. 결제·세금계산서 자동화 없음 — 금액과 계좌 안내까지(절대 규칙 13).
 * 데이터는 브랜드 뷰만(규칙 1). 계좌는 settings.bank_account를 서버에서 읽어 은행·번호·예금주 세 값만 그린다.
 */
export const maxDuration = 60; // 패키지 생성 서버 액션이 이 라우트에서 실행된다 — 사진 다운로드·zip 시간

const OPEN = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"];
const FLAT = { borderTop: 0, paddingTop: 4 } as const;

export default async function BillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const base = `/b/${slug}`;
  const [orders, samples, bank, cands, pkgs] = await Promise.all([
    listBillingOrders(brand.id), listBrandSamples(brand.id), getBankAccount(), listExportCandidates(brand.id), listExportPackages(brand.id),
  ]);

  // 청구 예정 = 확정 발주 청구 합계(끝나지 않은 건) + 입금 전 샘플비 + 미회수 샘플 상품가 — 홈과 같은 기준
  const orderTotals = orders.filter((o) => OPEN.includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);
  const sampleFees = samples.filter((x) => x.status !== "cancelled" && x.payment_required && !x.payment_confirmed_at).reduce((s, x) => s + (x.logistics_fee_krw ?? 0), 0);
  const sampleCharges = samples.reduce((s, x) => s + x.charged, 0);
  const due = orderTotals + sampleFees + sampleCharges;
  const paid = orders.filter((o) => o.status !== "cancelled" && o.depositConfirmedAt && (o.depositKrw ?? 0) > 0);
  const paidSum = paid.reduce((s, o) => s + (o.depositKrw ?? 0), 0);

  const [covers, candCovers] = await Promise.all([
    signedReadUrls("productImages", orders.map((o) => o.cover).filter(Boolean) as string[]),
    signedReadUrls("productImages", cands.map((c) => c.cover).filter(Boolean) as string[]),
  ]);
  const shown = orders.filter((o) => o.status !== "cancelled");
  const name = (o: (typeof orders)[number]) => o.firstName ?? tk("billing.orders");

  return (
    <div className="g12">
      <div className="c8"><h1 className="h1">{tk("billing.title")}</h1></div>
      <div className="c4 tr"><a href="#packages" className="btn sec">{tk("billing.packagesBtn")}</a></div>
      <div className="c12 rule-ink" />

      {/* 세 칸이 같은 잉크 룰에서 출발한다 — 패널 자체 룰은 내지 않는다(프로토타입 v-billing) */}
      <div className="c4">
        <div className="figure" style={FLAT}>
          <div className="label">{tk("home.billing")}</div>
          <div className={`v num ${due === 0 ? "dim" : ""}`}><small>₩</small>{krw(due)}</div>
          <p className="help">{tk("home.billingHelp")}</p>
        </div>
      </div>
      <div className="c4">
        <div className="figure" style={FLAT}>
          <div className="label">{tk("billing.deposits")}</div>
          <div className={`v num ${paidSum === 0 ? "dim" : ""}`}><small>₩</small>{krw(paidSum)}</div>
          <p className="help">{paid.length ? tk("billing.depositsHelp", { n: paid.length }) : tk("billing.depositsNone")}</p>
        </div>
      </div>
      <div className="c4">
        <div className="figure" style={FLAT}>
          <div className="label">{tk("billing.account")}</div>
          {bank ? (
            <>
              <p className="acct">{bank.bank} <span className="num">{bank.number}</span><br />{bank.holder}</p>
              <p className="help">{tk("billing.accountHelp")}</p>
            </>
          ) : (
            <p className="mt-1 text-body text-ink-2">{tk("billing.accountNone")}</p>
          )}
        </div>
      </div>

      <div className="c12 section-h mt-6"><h2>{tk("billing.orders")}<span className="count">{shown.length}</span></h2></div>
      <div className="c12 -mt-4 min-w-0">
        {shown.length === 0 ? (
          <p className="text-meta text-ink-2">{tk("billing.ordersEmpty")}</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="tbl bill">
              <thead>
                <tr>
                  <th>{tk("billing.col.product")}</th>
                  <th className="r pl-4">{tk("billing.col.qty")}</th>
                  <th className="r pl-4">{tk("billing.col.total")}</th>
                  <th className="stc w-56 pl-8 max-sm:hidden">{tk("billing.col.now")}</th>
                  <th className="pl-4"><span className="sr-only">{tk("billing.detail")}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const now = tk(orderStateKey({ status: o.status, owner_role: o.ownerRole, deposit_reported_at: o.depositReportedAt, deposit_confirmed_at: o.depositConfirmedAt }));
                  return (
                    <tr key={o.id}>
                      <td className="min-w-0">
                        <span className="ph">
                          <Photo src={o.cover ? covers[o.cover] ?? null : null} alt="" />
                          <span className="min-w-0">
                            <span className="block font-medium">{name(o)}{o.more > 0 && <span className="font-normal text-muted"> {tk("detail.more", { n: o.more })}</span>}</span>
                            <span className="code">{tk("billing.ordered", { date: fmtDay(o.createdAt) })}{o.reorder ? ` · ${tk("billing.reorder")}` : ""}</span>
                            <span className="block text-meta text-ink-2 sm:hidden">{now}</span>
                          </span>
                        </span>
                      </td>
                      <td className="r pl-4">{o.qty}</td>
                      <td className={`r pl-4 ${o.total != null ? "strong" : "text-muted"}`}>{o.total != null ? `₩${krw(o.total)}` : tk("billing.notFixed")}</td>
                      <td className="stc w-56 pl-8 text-meta text-ink-2 max-sm:hidden">{now}</td>
                      <td className="r pl-4"><Link href={`${base}/orders/${o.id}`} className="link" aria-label={tk("billing.detailOf", { name: name(o) })}>{tk("billing.detail")}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div id="packages" className="c12 section-h mt-6 scroll-mt-24">
        <h2>{tk("billing.packages")}<span className="count">{pkgs.length}</span></h2>
      </div>
      <div className="c8 -mt-4 min-w-0">
        <p className="text-meta text-ink-2">{tk("billing.packagesHelp")}</p>
        <PackageRows brandId={brand.id} pkgs={pkgs} names={new Map(cands.map((c) => [c.productId, c.name]))} />
      </div>
      <div className="c12 min-w-0">
        <ExportForm brandId={brand.id} candidates={cands.map((c) => ({ ...c, cover: c.cover ? candCovers[c.cover] ?? null : null }))} />
      </div>
    </div>
  );
}
