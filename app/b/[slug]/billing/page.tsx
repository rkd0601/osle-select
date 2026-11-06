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
import { GridCols } from "@/components/domain/grid-cols";
import { PackageRows, packageGroupCount } from "./package-rows";

/**
 * B-11 청구 (디자인 v2.2 "청구", DECISIONS d-6 — `/exports` 흡수). 12칸: "청구" / "쇼핑몰용 상품 파일" → 잉크 룰 →
 * 4칸 셋(청구 예정 · 납부한 선금 · 입금 계좌) → "발주 n" 표 다섯 열(상품 · 수량 · 청구 · 지금 · 내역) → "쇼핑몰용 상품 파일 n"(#packages).
 * 상품가·수수료·물류·선금 분해는 발주 상세 청구표에서. 결제·세금계산서 자동화 없음 — 금액과 계좌 안내까지(절대 규칙 13).
 * 데이터는 브랜드 뷰만(규칙 1). 계좌는 settings.bank_account를 서버에서 읽어 은행·번호·예금주 세 값만 그린다.
 */
export const maxDuration = 60; // 패키지 생성 서버 액션이 이 라우트에서 실행된다 — 사진 다운로드·zip 시간

const OPEN = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"];
const FLAT = { borderTop: 0, paddingTop: 4 } as const;

export default async function BillingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ make?: string }> }) {
  const { slug } = await params;
  // 만들기 폼(후보·모두 선택·사진 후보)은 접어 둔다(4차 검증 D5) — 머리 "쇼핑몰용 상품 파일"이 ?make=1로 펼치고, 기본은 파일 목록만
  const make = (await searchParams).make === "1";
  const { brand } = await requireBrandMember(slug);
  const base = `/b/${slug}`;
  const [orders, samples, bank, cands, pkgs] = await Promise.all([
    listBillingOrders(brand.id), listBrandSamples(brand.id), getBankAccount(), listExportCandidates(brand.id), listExportPackages(brand.id),
  ]);

  // 청구 예정 = 확정 발주 청구 합계(끝나지 않은 건) + 샘플 물류비(후불, 아직 발주에 안 붙은 것) + 샘플 구매 — 홈과 같은 기준(S6)
  const orderTotals = orders.filter((o) => OPEN.includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0);
  const sampleFees = samples.reduce((s, x) => s + x.due.logistics, 0);
  const sampleCharges = samples.reduce((s, x) => s + x.due.purchase, 0);
  const due = orderTotals + sampleFees + sampleCharges;
  const paid = orders.filter((o) => o.status !== "cancelled" && o.depositConfirmedAt && (o.depositKrw ?? 0) > 0);
  const paidSum = paid.reduce((s, o) => s + (o.depositKrw ?? 0), 0);

  const [covers, candCovers] = await Promise.all([
    signedReadUrls("productImages", orders.map((o) => o.cover).filter(Boolean) as string[]),
    make ? signedReadUrls("productImages", cands.map((c) => c.cover).filter(Boolean) as string[]) : Promise.resolve({} as Record<string, string>),
  ]);
  const shown = orders.filter((o) => o.status !== "cancelled");
  const groups = packageGroupCount(pkgs); // 상품별 최신 1건 기준 개수(v2.3 T5)
  const name = (o: (typeof orders)[number]) => o.firstName ?? tk("billing.orders");

  return (
    <div className="g12">
      <div className="c8"><h1 className="h1">{tk("billing.title")}</h1></div>
      <div className="c4 tr">
        <Link href={make ? `${base}/billing#packages` : `${base}/billing?make=1#packages`} className="btn sec w3" aria-expanded={make}>
          {tk("billing.packagesBtn")}
        </Link>
      </div>
      <div className="c12 rule-ink" />

      {/* 세 칸이 같은 잉크 룰에서 출발한다 — 패널 자체 룰은 내지 않는다(프로토타입 v-billing) */}
      <div className="c4">
        <div className="figure" style={FLAT}>
          <div className="label">{tk("home.billing")}</div>
          <div className={`v num ${due === 0 ? "dim" : ""}`}><small>₩</small>{krw(due)}</div>
          <p className="help">{sampleFees + sampleCharges > 0 ? tk("billing.dueSamples", { a: krw(sampleFees), b: krw(sampleCharges) }) : tk("home.billingHelp")}</p>
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
              {/* 계좌는 한 줄(값 줄 높이 48 = 옆 숫자와 같은 y) · 예금주는 도움말 줄로(L2) */}
              <p className="acct" title={`${bank.bank} ${bank.number}`}>{bank.bank} <span className="num">{bank.number}</span></p>
              <p className="help">{tk("billing.accountHolder", { name: bank.holder })} · {tk("billing.accountHelp")}</p>
            </>
          ) : (
            <p className="text-body text-ink-2">{tk("billing.accountNone")}</p>
          )}
        </div>
      </div>

      <div className="c12 section-h"><h2>{tk("billing.orders")}<span className="count">{shown.length}</span></h2></div>
      <div className="c12 min-w-0">
        {shown.length === 0 ? (
          <p className="text-meta text-ink-2">{tk("billing.ordersEmpty")}</p>
        ) : (
          <div className="relative max-sm:max-w-full max-sm:overflow-x-auto">
            {/* 열 경계 = 12칸 선(상품 5 · 수량 1 · 청구 2 · 지금 3 · 내역 1, v2.3 정렬 규칙). 모바일은 "지금"을 상품 칸 안 한 줄로 */}
            <table className="tbl bill gridt max-sm:min-w-[520px]">
              <GridCols spans={[5, 1, 2, 3, 1]} />
              <thead>
                <tr>
                  <th>{tk("billing.col.product")}</th>
                  <th className="r">{tk("billing.col.qty")}</th>
                  <th className="r">{tk("billing.col.total")}</th>
                  <th className="ell">{tk("billing.col.now")}</th>
                  <th className="r"><span className="sr-only">{tk("billing.detail")}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const now = tk(orderStateKey({ status: o.status, owner_role: o.ownerRole, deposit_reported_at: o.depositReportedAt, deposit_confirmed_at: o.depositConfirmedAt }));
                  return (
                    <tr key={o.id}>
                      <td className="overflow-hidden">
                        <span className="ph">
                          <Photo src={o.cover ? covers[o.cover] ?? null : null} alt="" />
                          <span className="min-w-0">
                            <span className="block font-medium">{name(o)}{o.more > 0 && <span className="font-normal text-muted"> {tk("detail.more", { n: o.more })}</span>}</span>
                            <span className="code">{tk("billing.ordered", { date: fmtDay(o.createdAt) })}{o.reorder ? ` · ${tk("billing.reorder")}` : ""}</span>
                          </span>
                        </span>
                      </td>
                      <td className="r">{o.qty}</td>
                      <td className={`r ${o.total != null ? "strong" : "text-muted"}`}>{o.total != null ? `₩${krw(o.total)}` : tk("billing.notFixed")}</td>
                      <td className="ell text-meta text-ink-2" title={now}>{now}</td>
                      <td className="r"><Link href={`${base}/orders/${o.id}`} className="link" aria-label={tk("billing.detailOf", { name: name(o) })}>{tk("billing.detail")}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 섹션 머리 아래 1px 룰 하나 — 도움말은 머리 오른쪽, 아래 목록은 윗 룰 없이(겹선 금지, v2.3) */}
      <div id="packages" className="c12 section-h scroll-mt-24 flex-wrap">
        <h2>{tk("billing.packages")}<span className="count">{groups}</span></h2>
        <p className="meta">{tk("billing.packagesHelp")}</p>
      </div>
      <div className="c8 min-w-0">
        <PackageRows brandId={brand.id} pkgs={pkgs} names={new Map(cands.map((c) => [c.productId, c.name]))} />
      </div>
      {make && (
        <div id="packages-make" className="c12 min-w-0">
          <ExportForm brandId={brand.id} candidates={cands.map((c) => ({ ...c, cover: c.cover ? candCovers[c.cover] ?? null : null }))} />
        </div>
      )}
    </div>
  );
}
