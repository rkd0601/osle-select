import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tk } from "@/lib/i18n";

/** B-01 브랜드 홈 (2단계 골격). "지금 당신 차례" 카드는 3단계부터 실제 데이터로 채운다. */
export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const supabase = await createClient();
  const [{ count: offers }, { count: items }] = await Promise.all([
    supabase.from("v_offers_brand").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("request_items").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).not("status", "in", "(closed,cancelled)"),
  ]);
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-[22px] font-bold tracking-tight">{tk("home.yourTurn")}</h1>
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5 text-[14px] text-ink-2">
          {offers ? (
            <>새 제안 <span className="num font-semibold text-ink">{offers}</span>건이 기다리고 있어요. <Link className="text-signature underline-offset-4 hover:underline" href={`/b/${slug}/offers`}>라인시트 보기 →</Link></>
          ) : tk("home.empty")}
        </div>
      </section>
      <aside className="space-y-4">
        <Link href={`/b/${slug}/requests/new`} className="block rounded-[var(--radius)] bg-ink px-4 py-3 text-center text-[14px] font-medium text-paper">{tk("home.request")}</Link>
        <div className="rounded-[var(--radius)] border border-line bg-surface p-4 text-[13px]">
          <div className="text-muted">진행 중 요청 항목</div>
          <div className="num mt-1 text-[22px] font-semibold">{items ?? 0}</div>
        </div>
      </aside>
    </div>
  );
}
