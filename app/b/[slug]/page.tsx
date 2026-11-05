import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { tk } from "@/lib/i18n";
import { krw } from "@/lib/format";
import { listBrandProgress, RECOMMEND_GROUP } from "@/lib/db/brand/progress";
import { listBrandSamples } from "@/lib/db/brand/samples";
import { listBrandOrders } from "@/lib/db/brand/orders";
import { cartCards, cartHref, todoCount } from "@/lib/brand-progress";
import { TodoRow } from "@/components/domain/todo-row";
import { PhotoCard } from "@/components/domain/photo-card";
import { Figure } from "@/components/domain/figure";
import { ServiceGuide } from "@/components/domain/service-guide";
import { cardAction, cardEm, cardState, todoText } from "./progress/card-text";

/**
 * B-01 브랜드 홈 (디자인 v2.2 §5 "홈(대시보드)", DECISIONS d-11) — 개념 셋만: 할 일 · 청구 예정 · 진행 중.
 * 8칸 "할 일 n"(40/300, n 금색, 아래 금색 룰) + 4칸 "상품 요청" → 8칸 할 일 행(기한 순, "무엇을 언제까지" + 동사 버튼) / 4칸 청구 예정
 * → "진행 중 n" + 사진 카드 3칸(내 차례가 아닌 진행 중, 최근 8). 할 일 0이면 "할 일이 없어요" + 진행 중만.
 * 눈썹·날짜·새 제안·항목 수 패널·상태 점·핸드오프 카드 없음. 데이터는 전부 브랜드 뷰(규칙 1).
 * v2.3: 청구 예정(4칸, 1px 룰 위)은 할 일이 0건이어도 보인다(3차 검증 C2). 요청이 0건인 새 브랜드는 첫 화면(d-12) —
 * "찾는 상품이 있나요?" + 첫 요청 버튼 + 이용 안내 블록(설정 › 이용 안내와 같은 컴포넌트).
 */
const CONFIRMED = ["confirmed", "cn_shipped", "kr_inspecting", "sent_to_brand", "delivered"];

export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const base = `/b/${brand.slug}`;
  const [cards, samples, orders] = await Promise.all([listBrandProgress(brand.id), listBrandSamples(brand.id), listBrandOrders(brand.id)]);

  // 할 일: 내 차례 카드(정렬 = 할 일 → 기한 순, lib/brand-progress.sortCards)
  const todos = cards.filter((c) => c.mine);
  // 샘플 요청서에 담아 둔 제안(진행 화면 담김 바와 같은 기준) → 할 일 1건으로 묶는다 (7차 검증 H1)
  const cart = cartCards(cards);
  const todoN = todoCount(cards);
  // 진행 중: 끝나지 않았고 내 차례가 아닌 것(최근 순), 8장까지
  const doing = cards.filter((c) => !c.mine && !c.done);

  // 청구 예정: 미회수 샘플 상품가(발주 때 차감) + 입금 전 샘플비 + 확정된 발주 청구 합계(미완료 건)
  const sampleCharges = samples.reduce((s, x) => s + x.charged, 0);
  const sampleFees = samples.filter((x) => x.status !== "cancelled" && x.payment_required && !x.payment_confirmed_at).reduce((s, x) => s + (x.logistics_fee_krw ?? 0), 0);
  const confirmed = orders.filter((o) => CONFIRMED.includes(o.status));
  const billing = sampleCharges + sampleFees + confirmed.reduce((s, o) => s + (o.total ?? 0), 0);
  const billingHelp = (
    <>
      {confirmed.length > 0 && `${tk("home.confirmedOrders", { n: confirmed.length })} · `}
      <Link href={`${base}/billing`} className="link">{tk("home.toBilling")}</Link>
    </>
  );

  // 새 브랜드: 요청이 하나도 없으면(추천 제안만 있어도) 첫 화면
  if (!cards.some((c) => c.requestId !== RECOMMEND_GROUP)) {
    return (
      <div className="g12">
        <div className="c8">
          <h1 className="display">{tk("first.title")}</h1>
          <span className="goldrule" aria-hidden />
          <p className="lead" style={{ marginTop: 16, maxWidth: "46ch" }}>{tk("first.lead")}</p>
          <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 32 }}>
            <Link href={`${base}/requests/new`} className="btn lg">{tk("first.cta")}</Link>
            <Link href={`${base}/help#example`} className="link">{tk("first.example")}</Link>
          </div>
        </div>
        <div className="c4" />
        <ServiceGuide helpHref={`${base}/help`} />
      </div>
    );
  }

  return (
    <div className="g12">
      {todoN ? (
        <div className="c8">
          <h1 className="display">{tk("home.todo")} <span className="num gold">{todoN}</span></h1>
          <span className="goldrule" aria-hidden />
        </div>
      ) : (
        <div className="c8"><h1 className="h1 text-ink-2" style={{ fontSize: 28, fontWeight: 400 }}>{tk("home.todoNone")}</h1></div>
      )}
      <div className="c4 tr max-sm:hidden"><Link href={`${base}/requests/new`} className="btn">{tk("home.request")}</Link></div>

      <div className="c8">
        {todos.map((c) => {
          const t = todoText(c);
          return <TodoRow key={c.key} href={`${base}${c.href}`} actionHref={cardAction(c, base)?.href} photo={c.photo} title={t.title} sub={t.sub} action={t.action} />;
        })}
        {cart.length > 0 && (
          <TodoRow href={`${base}${cartHref(cart)}`} photo={cart[0].photo} title={tk("todo.cart.t")}
            sub={tk(cart.length > 1 ? "todo.cart.sMany" : "todo.cart.s", { name: cart[0].name, n: cart.length })} action={tk("todo.cart.a")} />
        )}
        {todoN === 0 &&<p className="text-meta text-ink-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>{tk("home.nothingToDecide")}</p>}
      </div>
      <aside className="c4">
        <Figure label={tk("home.billing")} currency="₩" value={krw(billing)} dim={billing === 0} help={billingHelp} />
      </aside>

      <div className="c12 section-h">
        <h2>{tk("home.inProgress")}<span className="count">{doing.length}</span></h2>
        <Link href={`${base}/progress`} className="link">{tk("home.viewAll")}</Link>
      </div>
      {doing.length === 0 && <p className="c12 text-meta text-ink-2">{tk("home.doingNone")}</p>}
      {doing.slice(0, 8).map((c) => (
        <PhotoCard key={c.key} className="c3" href={`${base}${c.href}`} photo={c.photo} name={c.name} em={cardEm(c)} state={cardState(c)} emptyLabel={tk("progress.noPhoto")} />
      ))}

      <div className="c12 sm:hidden"><Link href={`${base}/requests/new`} className="btn lg w-full">{tk("home.request")}</Link></div>
    </div>
  );
}
